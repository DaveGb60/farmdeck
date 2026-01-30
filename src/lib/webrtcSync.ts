// WebRTC P2P Sync for FarmDeck PWA
import { FarmProject, FarmRecord, getRecordsByProject, importProject, importRecord } from './db';

// Types for sync metadata and messages
export interface SyncMetadata {
  deviceId: string;
  deviceName: string;
  projectCount: number;
  recordCount: number;
  lastUpdated: string;
  projects: ProjectSummary[];
}

export interface ProjectSummary {
  id: string;
  title: string;
  recordCount: number;
  updatedAt: string;
  startDate: string;
  isCompleted: boolean;
}

export interface SyncMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'metadata' | 'data-chunk' | 'data-complete' | 
        'sync-request' | 'sync-accept' | 'sync-reject' | 'cancel' | 'ack' | 'error';
  payload: unknown;
  timestamp: number;
  messageId: string;
}

export interface SyncDataPayload {
  projects: FarmProject[];
  records: FarmRecord[];
}

export interface TransferProgress {
  phase: 'metadata' | 'selecting' | 'transferring' | 'complete' | 'cancelled' | 'error';
  totalChunks: number;
  sentChunks: number;
  totalBytes: number;
  sentBytes: number;
  direction: 'send' | 'receive';
}

export interface ConflictInfo {
  type: 'newer_local' | 'newer_remote' | 'both_modified';
  localVersion: string;
  remoteVersion: string;
  projectId: string;
  projectTitle: string;
}

export interface SyncSelection {
  projectIds: string[];
  direction: 'send' | 'receive' | 'bidirectional';
  resolveConflicts: 'keep_local' | 'keep_remote' | 'keep_newer';
}

// Generate a unique device ID (persisted in localStorage)
export function getDeviceId(): string {
  let deviceId = localStorage.getItem('farmdeck-device-id');
  if (!deviceId) {
    deviceId = `device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    localStorage.setItem('farmdeck-device-id', deviceId);
  }
  return deviceId;
}

// Generate a short pairing code (6 alphanumeric chars)
export function generatePairingCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Generate unique message ID
export function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

// Chunk size for data transfer (16KB for reliability)
const CHUNK_SIZE = 16 * 1024;

// Encode data to base64 chunks
export function chunkData(data: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < data.length; i += CHUNK_SIZE) {
    chunks.push(data.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

// WebRTC Connection Manager with persistent connection handling
export class WebRTCSync {
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private pairingCode: string = '';
  private isInitiator: boolean = false;
  private receivedChunks: string[] = [];
  private expectedChunks: number = 0;
  private connectionTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts: number = 0;
  private lastOffer: RTCSessionDescriptionInit | null = null;
  private lastAnswer: RTCSessionDescriptionInit | null = null;
  
  // Configuration for persistence
  private readonly CONNECTION_TIMEOUT_MS = 180000; // 3 minutes for pairing (extended)
  private readonly HEARTBEAT_INTERVAL_MS = 5000; // 5 second heartbeat
  private readonly MAX_RECONNECT_ATTEMPTS = 3;
  private readonly RECONNECT_DELAY_MS = 2000;
  
  // Callbacks
  public onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
  public onDataChannelStateChange?: (state: RTCDataChannelState) => void;
  public onMetadataReceived?: (metadata: SyncMetadata) => void;
  public onSyncRequest?: (selection: SyncSelection, metadata: SyncMetadata) => void;
  public onTransferProgress?: (progress: TransferProgress) => void;
  public onDataReceived?: (data: SyncDataPayload) => void;
  public onError?: (error: string) => void;
  public onMessage?: (message: SyncMessage) => void;
  public onReconnecting?: (attempt: number, maxAttempts: number) => void;

  constructor() {
    this.initializePeerConnection();
  }
  
  // Initialize peer connection with ICE servers
  private initializePeerConnection(): void {
    // Use multiple STUN servers for better NAT traversal
    const config: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
      ],
      iceCandidatePoolSize: 10, // Pre-gather ICE candidates
    };
    
    this.pc = new RTCPeerConnection(config);
    this.setupPeerConnectionHandlers();
  }
  
  // Start connection timeout
  private startConnectionTimeout(): void {
    this.clearConnectionTimeout();
    this.connectionTimeout = setTimeout(() => {
      console.error('[WebRTC] Connection timeout - no connection established');
      this.onError?.('Connection timeout - please try again');
      this.close();
    }, this.CONNECTION_TIMEOUT_MS);
  }
  
  // Clear connection timeout
  private clearConnectionTimeout(): void {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
  }
  
  // Start heartbeat to maintain connection
  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.dc?.readyState === 'open') {
        this.sendMessage({
          type: 'ack',
          payload: { heartbeat: true, timestamp: Date.now() },
          timestamp: Date.now(),
          messageId: generateMessageId()
        });
      }
    }, this.HEARTBEAT_INTERVAL_MS);
  }
  
  // Stop heartbeat
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
  
  // Attempt reconnection
  private async attemptReconnect(): Promise<boolean> {
    if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
      console.log('[WebRTC] Max reconnection attempts reached');
      return false;
    }
    
    this.reconnectAttempts++;
    console.log(`[WebRTC] Attempting reconnection ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS}`);
    this.onReconnecting?.(this.reconnectAttempts, this.MAX_RECONNECT_ATTEMPTS);
    
    await new Promise(resolve => setTimeout(resolve, this.RECONNECT_DELAY_MS));
    
    // Try to restart ICE
    if (this.pc && this.pc.connectionState !== 'closed') {
      try {
        this.pc.restartIce();
        return true;
      } catch (error) {
        console.error('[WebRTC] ICE restart failed:', error);
        return false;
      }
    }
    
    return false;
  }

  private setupPeerConnectionHandlers() {
    if (!this.pc) return;

    this.pc.onconnectionstatechange = async () => {
      const state = this.pc?.connectionState || 'closed';
      console.log('[WebRTC] Connection state:', state);
      
      if (state === 'connected') {
        this.clearConnectionTimeout();
        this.reconnectAttempts = 0;
        this.startHeartbeat();
      } else if (state === 'disconnected') {
        // Attempt automatic reconnection on disconnect
        this.stopHeartbeat();
        const reconnected = await this.attemptReconnect();
        if (!reconnected) {
          this.clearConnectionTimeout();
          this.onConnectionStateChange?.(state);
        }
        return; // Don't notify yet, wait for reconnection result
      } else if (state === 'failed') {
        this.stopHeartbeat();
        // One more reconnection attempt on failure
        const reconnected = await this.attemptReconnect();
        if (!reconnected) {
          this.clearConnectionTimeout();
          this.onConnectionStateChange?.(state);
        }
        return;
      } else if (state === 'closed') {
        this.stopHeartbeat();
        this.clearConnectionTimeout();
      }
      
      this.onConnectionStateChange?.(state);
    };

    this.pc.oniceconnectionstatechange = () => {
      const iceState = this.pc?.iceConnectionState;
      console.log('[WebRTC] ICE connection state:', iceState);
      
      // Handle ICE disconnection with grace period
      if (iceState === 'disconnected') {
        console.log('[WebRTC] ICE disconnected, waiting for recovery...');
        // Give it a chance to recover before marking as failed
        setTimeout(() => {
          if (this.pc?.iceConnectionState === 'disconnected') {
            console.log('[WebRTC] ICE still disconnected, attempting restart');
            this.pc?.restartIce?.();
          }
        }, 3000);
      }
    };

    this.pc.onicegatheringstatechange = () => {
      console.log('[WebRTC] ICE gathering state:', this.pc?.iceGatheringState);
    };
    
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] New ICE candidate:', event.candidate.type);
      }
    };

    this.pc.ondatachannel = (event) => {
      console.log('[WebRTC] Data channel received');
      this.dc = event.channel;
      this.setupDataChannelHandlers();
    };
  }

  private setupDataChannelHandlers() {
    if (!this.dc) return;

    this.dc.onopen = () => {
      console.log('[WebRTC] Data channel open');
      this.onDataChannelStateChange?.('open');
    };

    this.dc.onclose = () => {
      console.log('[WebRTC] Data channel closed');
      this.onDataChannelStateChange?.('closed');
    };

    this.dc.onerror = (error) => {
      console.error('[WebRTC] Data channel error:', error);
      this.onError?.('Data channel error');
    };

    this.dc.onmessage = (event) => {
      try {
        const message: SyncMessage = JSON.parse(event.data);
        console.log('[WebRTC] Message received:', message.type);
        this.handleMessage(message);
      } catch (error) {
        console.error('[WebRTC] Failed to parse message:', error);
      }
    };
  }

  private handleMessage(message: SyncMessage) {
    this.onMessage?.(message);

    switch (message.type) {
      case 'metadata':
        this.onMetadataReceived?.(message.payload as SyncMetadata);
        break;
      
      case 'sync-request':
        const { selection, metadata } = message.payload as { selection: SyncSelection; metadata: SyncMetadata };
        this.onSyncRequest?.(selection, metadata);
        break;
      
      case 'data-chunk':
        this.handleDataChunk(message.payload as { index: number; total: number; data: string });
        break;
      
      case 'data-complete':
        this.handleDataComplete();
        break;
      
      case 'error':
        this.onError?.(message.payload as string);
        break;
      
      case 'cancel':
        this.onTransferProgress?.({
          phase: 'cancelled',
          totalChunks: 0,
          sentChunks: 0,
          totalBytes: 0,
          sentBytes: 0,
          direction: 'receive'
        });
        break;
    }
  }

  private handleDataChunk(chunk: { index: number; total: number; data: string }) {
    this.receivedChunks[chunk.index] = chunk.data;
    this.expectedChunks = chunk.total;
    
    const receivedCount = this.receivedChunks.filter(c => c !== undefined).length;
    
    this.onTransferProgress?.({
      phase: 'transferring',
      totalChunks: chunk.total,
      sentChunks: receivedCount,
      totalBytes: chunk.total * CHUNK_SIZE,
      sentBytes: receivedCount * CHUNK_SIZE,
      direction: 'receive'
    });

    // Send acknowledgment
    this.sendMessage({
      type: 'ack',
      payload: { index: chunk.index },
      timestamp: Date.now(),
      messageId: generateMessageId()
    });
  }

  private handleDataComplete() {
    try {
      const fullData = this.receivedChunks.join('');
      const syncData: SyncDataPayload = JSON.parse(fullData);
      
      this.onTransferProgress?.({
        phase: 'complete',
        totalChunks: this.expectedChunks,
        sentChunks: this.expectedChunks,
        totalBytes: fullData.length,
        sentBytes: fullData.length,
        direction: 'receive'
      });
      
      this.onDataReceived?.(syncData);
      this.receivedChunks = [];
      this.expectedChunks = 0;
    } catch (error) {
      console.error('[WebRTC] Failed to parse received data:', error);
      this.onError?.('Failed to parse received data');
    }
  }

  // Create offer (initiator side)
  async createSession(): Promise<{ offer: RTCSessionDescriptionInit; pairingCode: string }> {
    if (!this.pc) throw new Error('PeerConnection not initialized');
    
    this.isInitiator = true;
    this.pairingCode = generatePairingCode();
    
    // Start connection timeout
    this.startConnectionTimeout();
    
    // Create data channel before offer
    this.dc = this.pc.createDataChannel('sync', {
      ordered: true,
      maxRetransmits: 3
    });
    this.setupDataChannelHandlers();

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    // Wait for ICE gathering to complete
    await this.waitForIceGathering();
    
    return {
      offer: this.pc.localDescription!,
      pairingCode: this.pairingCode
    };
  }

  // Join session (joiner side)
  async joinSession(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('PeerConnection not initialized');
    
    this.isInitiator = false;
    
    // Start connection timeout
    this.startConnectionTimeout();
    
    await this.pc.setRemoteDescription(offer);
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    // Wait for ICE gathering to complete
    await this.waitForIceGathering();
    
    return this.pc.localDescription!;
  }

  // Complete connection (initiator receives answer)
  async completeConnection(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) throw new Error('PeerConnection not initialized');
    await this.pc.setRemoteDescription(answer);
  }

  // Add ICE candidate
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) throw new Error('PeerConnection not initialized');
    await this.pc.addIceCandidate(candidate);
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

      const checkState = () => {
        if (this.pc?.iceGatheringState === 'complete') {
          this.pc.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };

      this.pc.addEventListener('icegatheringstatechange', checkState);
      
      // Timeout after 15 seconds for ICE gathering
      setTimeout(() => {
        this.pc?.removeEventListener('icegatheringstatechange', checkState);
        resolve();
      }, 15000);
    });
  }

  // Send a message through the data channel
  sendMessage(message: SyncMessage): boolean {
    if (!this.dc || this.dc.readyState !== 'open') {
      console.error('[WebRTC] Data channel not open');
      return false;
    }
    
    try {
      this.dc.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('[WebRTC] Failed to send message:', error);
      return false;
    }
  }

  // Send metadata about local data
  async sendMetadata(projects: FarmProject[]): Promise<void> {
    const projectSummaries: ProjectSummary[] = [];
    let totalRecords = 0;

    for (const project of projects) {
      const records = await getRecordsByProject(project.id);
      totalRecords += records.length;
      projectSummaries.push({
        id: project.id,
        title: project.title,
        recordCount: records.length,
        updatedAt: project.updatedAt,
        startDate: project.startDate,
        isCompleted: project.isCompleted
      });
    }

    const metadata: SyncMetadata = {
      deviceId: getDeviceId(),
      deviceName: navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop',
      projectCount: projects.length,
      recordCount: totalRecords,
      lastUpdated: new Date().toISOString(),
      projects: projectSummaries
    };

    this.sendMessage({
      type: 'metadata',
      payload: metadata,
      timestamp: Date.now(),
      messageId: generateMessageId()
    });
  }

  // Send sync request
  sendSyncRequest(selection: SyncSelection, metadata: SyncMetadata): void {
    this.sendMessage({
      type: 'sync-request',
      payload: { selection, metadata },
      timestamp: Date.now(),
      messageId: generateMessageId()
    });
  }

  // Send data in chunks
  async sendData(data: SyncDataPayload): Promise<void> {
    const jsonData = JSON.stringify(data);
    const chunks = chunkData(jsonData);
    
    console.log(`[WebRTC] Sending ${chunks.length} chunks, total size: ${jsonData.length} bytes`);

    for (let i = 0; i < chunks.length; i++) {
      this.sendMessage({
        type: 'data-chunk',
        payload: { index: i, total: chunks.length, data: chunks[i] },
        timestamp: Date.now(),
        messageId: generateMessageId()
      });

      this.onTransferProgress?.({
        phase: 'transferring',
        totalChunks: chunks.length,
        sentChunks: i + 1,
        totalBytes: jsonData.length,
        sentBytes: Math.min((i + 1) * CHUNK_SIZE, jsonData.length),
        direction: 'send'
      });

      // Small delay to prevent overwhelming the channel
      await new Promise(resolve => setTimeout(resolve, 10));
    }

    this.sendMessage({
      type: 'data-complete',
      payload: { totalChunks: chunks.length, totalBytes: jsonData.length },
      timestamp: Date.now(),
      messageId: generateMessageId()
    });

    this.onTransferProgress?.({
      phase: 'complete',
      totalChunks: chunks.length,
      sentChunks: chunks.length,
      totalBytes: jsonData.length,
      sentBytes: jsonData.length,
      direction: 'send'
    });
  }

  // Cancel transfer
  cancelTransfer(): void {
    this.sendMessage({
      type: 'cancel',
      payload: null,
      timestamp: Date.now(),
      messageId: generateMessageId()
    });
    this.receivedChunks = [];
  }

  // Close connection
  close(): void {
    this.clearConnectionTimeout();
    this.stopHeartbeat();
    
    if (this.dc) {
      this.dc.close();
      this.dc = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    
    this.receivedChunks = [];
    this.expectedChunks = 0;
    this.reconnectAttempts = 0;
    this.lastOffer = null;
    this.lastAnswer = null;
  }

  // Get connection state
  get connectionState(): RTCPeerConnectionState | null {
    return this.pc?.connectionState || null;
  }

  // Get data channel state
  get dataChannelState(): RTCDataChannelState | null {
    return this.dc?.readyState || null;
  }
  
  // Get reconnection status
  get isReconnecting(): boolean {
    return this.reconnectAttempts > 0 && this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS;
  }
  
  // Get remaining reconnection attempts
  get reconnectAttemptsRemaining(): number {
    return Math.max(0, this.MAX_RECONNECT_ATTEMPTS - this.reconnectAttempts);
  }

  // Check if connected
  get isConnected(): boolean {
    return this.pc?.connectionState === 'connected' && this.dc?.readyState === 'open';
  }

  get code(): string {
    return this.pairingCode;
  }
}

// Detect conflicts between local and remote data
export function detectConflicts(
  localProjects: FarmProject[],
  remoteMetadata: SyncMetadata
): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];
  
  for (const remoteSummary of remoteMetadata.projects) {
    const localProject = localProjects.find(p => p.id === remoteSummary.id);
    
    if (localProject) {
      const localTime = new Date(localProject.updatedAt).getTime();
      const remoteTime = new Date(remoteSummary.updatedAt).getTime();
      
      if (localTime !== remoteTime) {
        let type: ConflictInfo['type'];
        if (localTime > remoteTime) {
          type = 'newer_local';
        } else if (remoteTime > localTime) {
          type = 'newer_remote';
        } else {
          type = 'both_modified';
        }
        
        conflicts.push({
          type,
          localVersion: localProject.updatedAt,
          remoteVersion: remoteSummary.updatedAt,
          projectId: remoteSummary.id,
          projectTitle: remoteSummary.title
        });
      }
    }
  }
  
  return conflicts;
}

// Apply sync data to local database with proper deduplication
export async function applySyncData(
  data: SyncDataPayload,
  conflictResolution: 'keep_local' | 'keep_remote' | 'keep_newer' = 'keep_newer',
  localProjects: FarmProject[]
): Promise<{ imported: number; skipped: number; conflicts: number }> {
  let imported = 0;
  let skipped = 0;
  let conflicts = 0;

  for (const project of data.projects) {
    const localProject = localProjects.find(p => p.id === project.id);
    
    if (localProject) {
      conflicts++;
      const localTime = new Date(localProject.updatedAt).getTime();
      const remoteTime = new Date(project.updatedAt).getTime();
      
      let shouldImport = false;
      
      switch (conflictResolution) {
        case 'keep_remote':
          shouldImport = true;
          break;
        case 'keep_newer':
          shouldImport = remoteTime > localTime;
          break;
        case 'keep_local':
        default:
          shouldImport = false;
      }
      
      if (shouldImport) {
        await importProject(project);
        imported++;
      } else {
        skipped++;
      }
    } else {
      await importProject(project);
      imported++;
    }
  }

  // Get existing records for all projects being synced to detect duplicates
  const existingRecordIds = new Set<string>();
  const existingRecordsMap = new Map<string, FarmRecord>();
  
  for (const project of data.projects) {
    const existingRecords = await getRecordsByProject(project.id);
    for (const record of existingRecords) {
      existingRecordIds.add(record.id);
      existingRecordsMap.set(record.id, record);
    }
  }

  for (const record of data.records) {
    const existingRecord = existingRecordsMap.get(record.id);
    
    if (existingRecord) {
      // Record exists - check if we should update it
      if (existingRecord.isLocked) {
        // Never overwrite locked records
        skipped++;
        continue;
      }
      
      const incomingTime = new Date(record.updatedAt).getTime();
      const existingTime = new Date(existingRecord.updatedAt).getTime();
      
      // Only update if incoming is newer
      if (incomingTime > existingTime) {
        try {
          await importRecord(record);
        } catch {
          skipped++;
        }
      } else {
        skipped++;
      }
    } else {
      // New record - import it
      try {
        await importRecord(record);
      } catch {
        skipped++;
      }
    }
  }

  return { imported, skipped, conflicts };
}

// Create signaling data for QR code (compressed)
export function createSignalingData(
  offer: RTCSessionDescriptionInit,
  pairingCode: string
): string {
  const data = {
    o: offer.sdp, // Offer SDP
    t: offer.type, // Type
    c: pairingCode // Code
  };
  return btoa(JSON.stringify(data));
}

// Parse signaling data from QR code
export function parseSignalingData(encoded: string): { offer: RTCSessionDescriptionInit; pairingCode: string } | null {
  try {
    // Handle potential whitespace or newlines
    const cleanedData = encoded.trim().replace(/\s/g, '');
    if (!cleanedData) {
      console.error('[WebRTC] Empty signaling data');
      return null;
    }
    
    const decoded = atob(cleanedData);
    const data = JSON.parse(decoded);
    
    if (!data.o || !data.t || !data.c) {
      console.error('[WebRTC] Invalid signaling data structure');
      return null;
    }
    
    return {
      offer: { sdp: data.o, type: data.t },
      pairingCode: data.c
    };
  } catch (error) {
    console.error('[WebRTC] Failed to parse signaling data:', error);
    return null;
  }
}

// Create answer signaling data
export function createAnswerData(answer: RTCSessionDescriptionInit): string {
  const data = {
    a: answer.sdp,
    t: answer.type
  };
  return btoa(JSON.stringify(data));
}

// Parse answer signaling data
export function parseAnswerData(encoded: string): RTCSessionDescriptionInit | null {
  try {
    // Handle potential whitespace or newlines
    const cleanedData = encoded.trim().replace(/\s/g, '');
    if (!cleanedData) {
      console.error('[WebRTC] Empty answer data');
      return null;
    }
    
    const decoded = atob(cleanedData);
    const data = JSON.parse(decoded);
    
    if (!data.a || !data.t) {
      console.error('[WebRTC] Invalid answer data structure');
      return null;
    }
    
    return { sdp: data.a, type: data.t };
  } catch (error) {
    console.error('[WebRTC] Failed to parse answer data:', error);
    return null;
  }
}
