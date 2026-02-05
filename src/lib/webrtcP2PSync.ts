// WebRTC P2P Sync Module for FarmDeck
// Uses QR code exchange for signaling (fully offline, no server required)

import { FarmProject, FarmRecord, generateId } from './db';
import { generateRecordFingerprint } from './fileSync';

// Sync data structure
export interface P2PSyncData {
  type: 'farmdeck-p2p-sync';
  version: '1.0';
  timestamp: string;
  deviceId: string;
  projects: FarmProject[];
  records: FarmRecord[];
}

// Signaling message for QR exchange
export interface SignalingMessage {
  type: 'offer' | 'answer';
  sdp: string;
  candidates: RTCIceCandidateInit[];
  deviceId: string;
  deviceName: string;
}

// Connection state
export type P2PState = 
  | 'idle'
  | 'creating_offer'
  | 'waiting_for_scan'
  | 'scanning_answer'
  | 'waiting_for_offer'
  | 'creating_answer'
  | 'waiting_for_connection'
  | 'connected'
  | 'transferring'
  | 'complete'
  | 'error';

// Transfer progress
export interface TransferProgress {
  phase: 'sending' | 'receiving';
  current: number;
  total: number;
  message: string;
}

// Sync result
export interface P2PSyncResult {
  success: boolean;
  projectsImported: number;
  recordsImported: number;
  projectsSkipped: number;
  recordsSkipped: number;
  message: string;
}

// Device ID for this session
function getDeviceId(): string {
  let id = localStorage.getItem('farmdeck-p2p-device-id');
  if (!id) {
    id = generateId();
    localStorage.setItem('farmdeck-p2p-device-id', id);
  }
  return id;
}

function getDeviceName(): string {
  const isMobile = /Mobile|Android|iPhone|iPad/.test(navigator.userAgent);
  return isMobile ? 'Mobile Device' : 'Desktop';
}

// Compress JSON for QR code (using shorter keys)
function compressSignaling(msg: SignalingMessage): string {
  const compressed = {
    t: msg.type === 'offer' ? 'o' : 'a',
    s: msg.sdp,
    c: msg.candidates.map(c => ({
      c: c.candidate,
      m: c.sdpMid,
      i: c.sdpMLineIndex,
    })),
    d: msg.deviceId.slice(0, 8),
    n: msg.deviceName.slice(0, 10),
  };
  return JSON.stringify(compressed);
}

// Decompress QR data
function decompressSignaling(data: string): SignalingMessage | null {
  try {
    const parsed = JSON.parse(data);
    return {
      type: parsed.t === 'o' ? 'offer' : 'answer',
      sdp: parsed.s,
      candidates: (parsed.c || []).map((c: any) => ({
        candidate: c.c,
        sdpMid: c.m,
        sdpMLineIndex: c.i,
      })),
      deviceId: parsed.d,
      deviceName: parsed.n,
    };
  } catch {
    return null;
  }
}

// WebRTC P2P Sync Manager
export class WebRTCP2PSync {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private _state: P2PState = 'idle';
  private localCandidates: RTCIceCandidateInit[] = [];
  private receivedChunks: string[] = [];
  private totalChunks: number = 0;
  private sendQueue: string[] = [];
  
  // Callbacks
  public onStateChange?: (state: P2PState) => void;
  public onOfferReady?: (qrData: string) => void;
  public onAnswerReady?: (qrData: string) => void;
  public onProgress?: (progress: TransferProgress) => void;
  public onDataReceived?: (data: P2PSyncData) => Promise<P2PSyncResult>;
  public onComplete?: (result: P2PSyncResult) => void;
  public onError?: (error: string) => void;

  get state(): P2PState {
    return this._state;
  }

  private setState(state: P2PState): void {
    console.log(`[WebRTCP2PSync] State: ${this._state} -> ${state}`);
    this._state = state;
    this.onStateChange?.(state);
  }

  // Create WebRTC peer connection
  private createPeerConnection(): RTCPeerConnection {
    const config: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
      ],
      iceCandidatePoolSize: 5,
    };

    const pc = new RTCPeerConnection(config);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.localCandidates.push(event.candidate.toJSON());
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('[WebRTCP2PSync] Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        this.setState('connected');
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.onError?.('Connection lost');
        this.setState('error');
      }
    };

    pc.ondatachannel = (event) => {
      console.log('[WebRTCP2PSync] Data channel received');
      this.dc = event.channel;
      this.setupDataChannel();
    };

    return pc;
  }

  // Set up data channel handlers
  private setupDataChannel(): void {
    if (!this.dc) return;

    this.dc.onopen = () => {
      console.log('[WebRTCP2PSync] Data channel open');
      this.setState('connected');
      // Process any queued messages
      this.flushSendQueue();
    };

    this.dc.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    this.dc.onerror = (error) => {
      console.error('[WebRTCP2PSync] Data channel error:', error);
    };

    this.dc.onclose = () => {
      console.log('[WebRTCP2PSync] Data channel closed');
    };
  }

  // Handle incoming messages
  private handleMessage(data: string): void {
    try {
      const msg = JSON.parse(data);
      
      if (msg.type === 'chunk') {
        this.receivedChunks[msg.index] = msg.data;
        this.totalChunks = msg.total;
        
        const received = this.receivedChunks.filter(c => c !== undefined).length;
        this.onProgress?.({
          phase: 'receiving',
          current: received,
          total: this.totalChunks,
          message: `Receiving data... ${Math.round((received / this.totalChunks) * 100)}%`,
        });
        
        // Check if complete
        if (received === this.totalChunks) {
          this.reassembleData();
        }
      } else if (msg.type === 'sync_complete') {
        this.onComplete?.({
          success: true,
          projectsImported: msg.projects || 0,
          recordsImported: msg.records || 0,
          projectsSkipped: 0,
          recordsSkipped: 0,
          message: 'Transfer complete',
        });
        this.setState('complete');
      } else if (msg.type === 'ready_to_receive') {
        // Other device is ready, start sending
        console.log('[WebRTCP2PSync] Receiver ready');
      }
    } catch (error) {
      console.error('[WebRTCP2PSync] Message parse error:', error);
    }
  }

  // Reassemble chunked data
  private async reassembleData(): Promise<void> {
    try {
      const fullData = this.receivedChunks.join('');
      const syncData: P2PSyncData = JSON.parse(fullData);
      
      this.onProgress?.({
        phase: 'receiving',
        current: this.totalChunks,
        total: this.totalChunks,
        message: 'Processing received data...',
      });

      if (this.onDataReceived) {
        const result = await this.onDataReceived(syncData);
        
        // Send acknowledgment
        this.send(JSON.stringify({ 
          type: 'sync_complete',
          projects: result.projectsImported,
          records: result.recordsImported,
        }));
        
        this.onComplete?.(result);
        this.setState('complete');
      }
      
      // Clear chunks
      this.receivedChunks = [];
      this.totalChunks = 0;
    } catch (error) {
      console.error('[WebRTCP2PSync] Reassemble error:', error);
      this.onError?.('Failed to process received data');
      this.setState('error');
    }
  }

  // Flush send queue
  private flushSendQueue(): void {
    while (this.sendQueue.length > 0 && this.dc?.readyState === 'open') {
      const msg = this.sendQueue.shift();
      if (msg) this.dc.send(msg);
    }
  }

  // Send data through data channel
  private send(data: string): boolean {
    if (!this.dc) return false;
    
    if (this.dc.readyState === 'open') {
      this.dc.send(data);
      return true;
    } else {
      this.sendQueue.push(data);
      return true;
    }
  }

  // Wait for ICE gathering to complete
  private waitForIceGathering(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.pc) {
        resolve();
        return;
      }

      if (this.pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      let resolved = false;
      const done = () => {
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      this.pc.onicegatheringstatechange = () => {
        if (this.pc?.iceGatheringState === 'complete') {
          done();
        }
      };

      // Timeout after 10 seconds
      setTimeout(done, 10000);
    });
  }

  // === SENDER FLOW ===

  // Step 1: Create offer and generate QR code
  async createOffer(): Promise<string> {
    try {
      this.setState('creating_offer');
      this.localCandidates = [];

      this.pc = this.createPeerConnection();
      
      // Create data channel
      this.dc = this.pc.createDataChannel('sync', { ordered: true });
      this.setupDataChannel();

      // Create offer
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      // Wait for ICE candidates
      await this.waitForIceGathering();

      // Create signaling message
      const signalingMsg: SignalingMessage = {
        type: 'offer',
        sdp: this.pc.localDescription!.sdp,
        candidates: this.localCandidates,
        deviceId: getDeviceId(),
        deviceName: getDeviceName(),
      };

      const qrData = compressSignaling(signalingMsg);
      console.log('[WebRTCP2PSync] Offer created, QR data length:', qrData.length);
      
      this.setState('waiting_for_scan');
      this.onOfferReady?.(qrData);
      
      return qrData;
    } catch (error) {
      console.error('[WebRTCP2PSync] Create offer error:', error);
      this.onError?.(error instanceof Error ? error.message : 'Failed to create offer');
      this.setState('error');
      throw error;
    }
  }

  // Step 2: Process scanned answer QR
  async processAnswer(qrData: string): Promise<void> {
    try {
      this.setState('scanning_answer');
      
      const signaling = decompressSignaling(qrData);
      if (!signaling || signaling.type !== 'answer') {
        throw new Error('Invalid answer QR code');
      }

      if (!this.pc) {
        throw new Error('No peer connection');
      }

      // Set remote description
      await this.pc.setRemoteDescription({
        type: 'answer',
        sdp: signaling.sdp,
      });

      // Add ICE candidates
      for (const candidate of signaling.candidates) {
        await this.pc.addIceCandidate(candidate);
      }

      this.setState('waiting_for_connection');
      console.log('[WebRTCP2PSync] Answer processed, waiting for connection...');
    } catch (error) {
      console.error('[WebRTCP2PSync] Process answer error:', error);
      this.onError?.(error instanceof Error ? error.message : 'Failed to process answer');
      this.setState('error');
      throw error;
    }
  }

  // Step 3: Send sync data
  async sendSyncData(projects: FarmProject[], records: FarmRecord[]): Promise<void> {
    try {
      if (!this.dc || this.dc.readyState !== 'open') {
        throw new Error('Data channel not ready');
      }

      this.setState('transferring');

      const syncData: P2PSyncData = {
        type: 'farmdeck-p2p-sync',
        version: '1.0',
        timestamp: new Date().toISOString(),
        deviceId: getDeviceId(),
        projects,
        records,
      };

      const jsonData = JSON.stringify(syncData);
      const CHUNK_SIZE = 16000; // Safe size for WebRTC
      const chunks: string[] = [];

      for (let i = 0; i < jsonData.length; i += CHUNK_SIZE) {
        chunks.push(jsonData.slice(i, i + CHUNK_SIZE));
      }

      console.log(`[WebRTCP2PSync] Sending ${chunks.length} chunks`);

      for (let i = 0; i < chunks.length; i++) {
        this.send(JSON.stringify({
          type: 'chunk',
          index: i,
          total: chunks.length,
          data: chunks[i],
        }));

        this.onProgress?.({
          phase: 'sending',
          current: i + 1,
          total: chunks.length,
          message: `Sending data... ${Math.round(((i + 1) / chunks.length) * 100)}%`,
        });

        // Small delay to prevent overwhelming
        if (i % 10 === 0) {
          await new Promise(r => setTimeout(r, 10));
        }
      }

      console.log('[WebRTCP2PSync] All chunks sent');
    } catch (error) {
      console.error('[WebRTCP2PSync] Send error:', error);
      this.onError?.(error instanceof Error ? error.message : 'Failed to send data');
      this.setState('error');
      throw error;
    }
  }

  // === RECEIVER FLOW ===

  // Step 1: Process scanned offer and create answer
  async processOffer(qrData: string): Promise<string> {
    try {
      this.setState('waiting_for_offer');
      
      const signaling = decompressSignaling(qrData);
      if (!signaling || signaling.type !== 'offer') {
        throw new Error('Invalid offer QR code');
      }

      this.localCandidates = [];
      this.pc = this.createPeerConnection();

      // Set remote description (offer)
      await this.pc.setRemoteDescription({
        type: 'offer',
        sdp: signaling.sdp,
      });

      // Add ICE candidates from offer
      for (const candidate of signaling.candidates) {
        await this.pc.addIceCandidate(candidate);
      }

      // Create answer
      this.setState('creating_answer');
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      // Wait for ICE gathering
      await this.waitForIceGathering();

      // Create answer signaling message
      const answerMsg: SignalingMessage = {
        type: 'answer',
        sdp: this.pc.localDescription!.sdp,
        candidates: this.localCandidates,
        deviceId: getDeviceId(),
        deviceName: getDeviceName(),
      };

      const qrAnswer = compressSignaling(answerMsg);
      console.log('[WebRTCP2PSync] Answer created, QR data length:', qrAnswer.length);
      
      this.setState('waiting_for_connection');
      this.onAnswerReady?.(qrAnswer);
      
      return qrAnswer;
    } catch (error) {
      console.error('[WebRTCP2PSync] Process offer error:', error);
      this.onError?.(error instanceof Error ? error.message : 'Failed to process offer');
      this.setState('error');
      throw error;
    }
  }

  // Clean up
  close(): void {
    console.log('[WebRTCP2PSync] Closing');
    this.dc?.close();
    this.pc?.close();
    this.dc = null;
    this.pc = null;
    this.localCandidates = [];
    this.receivedChunks = [];
    this.totalChunks = 0;
    this.sendQueue = [];
    this.setState('idle');
  }

  // Check if connected
  isConnected(): boolean {
    return this._state === 'connected' && this.dc?.readyState === 'open';
  }
}

// Import helper function
export async function importP2PSyncData(
  syncData: P2PSyncData,
  existingProjects: FarmProject[],
  importProjectFn: (project: FarmProject) => Promise<FarmProject | void>,
  importRecordFn: (record: FarmRecord) => Promise<FarmRecord | void>,
  getRecordsFn: (projectId: string) => Promise<FarmRecord[]>
): Promise<P2PSyncResult> {
  let projectsImported = 0;
  let recordsImported = 0;
  let projectsSkipped = 0;
  let recordsSkipped = 0;

  // Build fingerprint set for existing records
  const existingFingerprints = new Set<string>();
  for (const project of existingProjects) {
    const records = await getRecordsFn(project.id);
    for (const record of records) {
      existingFingerprints.add(generateRecordFingerprint(record));
    }
  }

  // Import projects
  for (const project of syncData.projects) {
    const exists = existingProjects.some(p => p.id === project.id);
    if (!exists) {
      await importProjectFn(project);
      projectsImported++;
    } else {
      projectsSkipped++;
    }

    // Import records for this project
    const projectRecords = syncData.records.filter(r => r.projectId === project.id);
    for (const record of projectRecords) {
      const fp = generateRecordFingerprint(record);
      if (!existingFingerprints.has(fp)) {
        await importRecordFn(record);
        existingFingerprints.add(fp);
        recordsImported++;
      } else {
        recordsSkipped++;
      }
    }
  }

  return {
    success: true,
    projectsImported,
    recordsImported,
    projectsSkipped,
    recordsSkipped,
    message: `Imported ${projectsImported} projects and ${recordsImported} records`,
  };
}
