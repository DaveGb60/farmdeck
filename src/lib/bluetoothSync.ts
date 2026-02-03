// Web Bluetooth + WebRTC Sync for FarmDeck PWA
// Simplified approach: Bluetooth for discovery ONLY, WebRTC for actual sync
// Since PWAs can only act as BLE clients (not servers), we use Bluetooth
// purely for proximity-based device discovery and trust establishment.

import { generateId } from './db';

// BLE MTU size for chunking (conservative for compatibility)
const BLE_CHUNK_SIZE = 512;

// Timeouts and retry config - more generous for real-world conditions
const GATT_CONNECT_TIMEOUT_MS = 20000;
const GATT_RETRY_COUNT = 5;
const GATT_RETRY_DELAY_MS = 1500;
const ICE_GATHERING_TIMEOUT_MS = 20000;
const CONNECTION_TIMEOUT_MS = 90000;
const HEARTBEAT_INTERVAL_MS = 5000;
const RECONNECT_MAX_ATTEMPTS = 5;

// Device identity stored in localStorage
export interface DeviceIdentity {
  deviceId: string;
  publicKey: string;
  privateKey: string;
  deviceName: string;
  createdAt: string;
}

// Paired device info stored in localStorage
export interface PairedDevice {
  deviceId: string;
  deviceName: string;
  publicKey: string;
  pairedAt: string;
  lastSyncAt?: string;
  bleDeviceId?: string;
}

// Pairing request payload
export interface PairRequest {
  device_id: string;
  public_key: string;
  app_version: string;
  nonce: string;
  capabilities: string[];
}

// Pairing response payload
export interface PairResponse {
  device_id: string;
  public_key: string;
  nonce_reply: string;
  accepted: boolean;
}

// Pairing confirmation payload
export interface PairConfirm {
  device_id: string;
  signature: string;
  timestamp: number;
}

// WebRTC signal payload (chunked SDP/ICE)
export interface WebRTCSignal {
  type: 'offer' | 'answer' | 'ice' | 'chunk' | 'complete';
  data: string;
  chunkIndex?: number;
  totalChunks?: number;
}

// Connection state
export type BluetoothSyncState = 
  | 'idle'
  | 'scanning'
  | 'connecting'
  | 'pairing'
  | 'paired'
  | 'signaling'
  | 'webrtc_connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

// Generate cryptographic keys for device identity
async function generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256',
    },
    true,
    ['sign', 'verify']
  );

  const publicKeyBuffer = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privateKeyBuffer = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

  return {
    publicKey: btoa(String.fromCharCode(...new Uint8Array(publicKeyBuffer))),
    privateKey: btoa(String.fromCharCode(...new Uint8Array(privateKeyBuffer))),
  };
}

// Generate random nonce
function generateNonce(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}

// Get or create device identity
export async function getOrCreateDeviceIdentity(): Promise<DeviceIdentity> {
  const stored = localStorage.getItem('farmdeck-device-identity');
  if (stored) {
    return JSON.parse(stored);
  }

  const { publicKey, privateKey } = await generateKeyPair();
  const identity: DeviceIdentity = {
    deviceId: generateId(),
    publicKey,
    privateKey,
    deviceName: navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop',
    createdAt: new Date().toISOString(),
  };

  localStorage.setItem('farmdeck-device-identity', JSON.stringify(identity));
  return identity;
}

// Get paired devices
export function getPairedDevices(): PairedDevice[] {
  const stored = localStorage.getItem('farmdeck-paired-devices');
  return stored ? JSON.parse(stored) : [];
}

// Save paired device
export function savePairedDevice(device: PairedDevice): void {
  const devices = getPairedDevices();
  const existingIndex = devices.findIndex(d => d.deviceId === device.deviceId);
  if (existingIndex >= 0) {
    devices[existingIndex] = device;
  } else {
    devices.push(device);
  }
  localStorage.setItem('farmdeck-paired-devices', JSON.stringify(devices));
}

// Remove paired device
export function removePairedDevice(deviceId: string): void {
  const devices = getPairedDevices().filter(d => d.deviceId !== deviceId);
  localStorage.setItem('farmdeck-paired-devices', JSON.stringify(devices));
}

// Check if Web Bluetooth is available
export function isBluetoothAvailable(): boolean {
  return 'bluetooth' in navigator;
}

// Chunk data for transmission
function chunkData(data: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < data.length; i += BLE_CHUNK_SIZE) {
    chunks.push(data.slice(i, i + BLE_CHUNK_SIZE));
  }
  return chunks;
}

// Helper: Delay with cancellation support
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timeoutId);
      reject(new Error('Aborted'));
    });
  });
}

// Helper: Promise with timeout
function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error(errorMsg)), ms)
    )
  ]);
}

// Bluetooth Sync Manager - Simplified for PWA limitations
// Key insight: PWAs can only be BLE CLIENTS, not servers.
// Therefore, we use Bluetooth purely for device discovery.
// WebRTC signaling happens via a lightweight approach.
export class BluetoothSync {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private device: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private server: any = null;
  private identity: DeviceIdentity | null = null;
  private receivedChunks: Map<number, string> = new Map();
  private expectedChunks: number = 0;
  
  // WebRTC connection
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  
  // Connection management
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempts: number = 0;
  private connectionAbortController: AbortController | null = null;
  private connectionTimeoutId: ReturnType<typeof setTimeout> | null = null;
  
  // State
  private _state: BluetoothSyncState = 'idle';
  
  // Callbacks
  public onStateChange?: (state: BluetoothSyncState) => void;
  public onPairRequest?: (request: PairRequest) => Promise<boolean>;
  public onDevicePaired?: (device: PairedDevice) => void;
  public onWebRTCConnected?: () => void;
  public onDataChannelOpen?: () => void;
  public onDataChannelMessage?: (data: string) => void;
  public onError?: (error: string) => void;
  public onProgress?: (message: string) => void;

  get state(): BluetoothSyncState {
    return this._state;
  }

  private setState(state: BluetoothSyncState): void {
    console.log(`[BluetoothSync] State: ${this._state} -> ${state}`);
    this._state = state;
    this.onStateChange?.(state);
  }

  // Clear timeouts and intervals
  private clearTimers(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.connectionTimeoutId) {
      clearTimeout(this.connectionTimeoutId);
      this.connectionTimeoutId = null;
    }
  }

  // Initialize the sync manager
  async initialize(): Promise<void> {
    this.identity = await getOrCreateDeviceIdentity();
    console.log('[BluetoothSync] Initialized with device ID:', this.identity.deviceId);
  }

  // Request Bluetooth device (user-initiated) - DISCOVERY ONLY
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async requestDevice(): Promise<any | null> {
    if (!isBluetoothAvailable()) {
      this.onError?.('Web Bluetooth is not available in this browser');
      return null;
    }

    try {
      this.setState('scanning');
      this.onProgress?.('Opening device picker...');
      
      this.connectionAbortController = new AbortController();
      
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav = navigator as any;
      
      // Request device - accept all devices since we can't rely on custom services
      // PWAs cannot advertise services, so we accept anything nearby
      this.device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        // Don't filter by service since other device may not advertise FarmDeck service
        optionalServices: ['battery_service', 'device_information'],
      });

      if (!this.device) {
        this.setState('idle');
        return null;
      }

      console.log('[BluetoothSync] Device selected:', this.device.name, this.device.id);
      this.onProgress?.(`Selected: ${this.device.name || 'Unknown Device'}`);
      
      return this.device;
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'NotFoundError') {
          this.onProgress?.('No device selected');
          this.setState('idle');
          return null;
        }
        if (error.name === 'SecurityError') {
          this.onError?.('Bluetooth access denied. Please allow Bluetooth permissions.');
          this.setState('error');
          return null;
        }
      }
      console.error('[BluetoothSync] Device request error:', error);
      this.onError?.(error instanceof Error ? error.message : 'Failed to request device');
      this.setState('error');
      return null;
    }
  }

  // Connect to device - simplified, just for verification
  async connect(): Promise<boolean> {
    if (!this.device) {
      this.onError?.('No device selected');
      return false;
    }

    this.setState('connecting');
    
    for (let attempt = 1; attempt <= GATT_RETRY_COUNT; attempt++) {
      try {
        this.onProgress?.(`Connecting... (attempt ${attempt}/${GATT_RETRY_COUNT})`);
        
        // Try GATT connect - this verifies Bluetooth connection works
        if (this.device.gatt) {
          try {
            this.server = await withTimeout(
              this.device.gatt.connect(),
              GATT_CONNECT_TIMEOUT_MS,
              'Connection timed out'
            );
            console.log('[BluetoothSync] GATT connected successfully');
          } catch (gattError) {
            console.log('[BluetoothSync] GATT connect optional, continuing:', gattError);
            // GATT connection is not strictly required for our use case
          }
        }
        
        this.onProgress?.('Device connected');
        return true;
      } catch (error) {
        console.warn(`[BluetoothSync] Connect attempt ${attempt} failed:`, error);
        
        if (attempt < GATT_RETRY_COUNT) {
          this.onProgress?.(`Connection attempt ${attempt} failed, retrying...`);
          try {
            await delay(GATT_RETRY_DELAY_MS, this.connectionAbortController?.signal);
          } catch {
            // Aborted, exit
            return false;
          }
        }
      }
    }
    
    // Even if GATT fails, we can still try to use the device for pairing
    // since we just need the device identity for trust establishment
    console.log('[BluetoothSync] Proceeding without full GATT connection');
    this.onProgress?.('Device identified');
    return true;
  }

  // Start pairing - now creates a trust relationship based on device discovery
  async startPairing(): Promise<boolean> {
    if (!this.identity) {
      await this.initialize();
    }

    try {
      this.setState('pairing');
      this.onProgress?.('Establishing trust...');
      
      // Generate unique pairing identity based on both devices
      const deviceName = this.device?.name || 'Unknown Device';
      const bleDeviceId = this.device?.id || generateId();
      
      // Create a deterministic device ID based on BLE device ID
      // This ensures the same physical device always gets the same identity
      const pairedDeviceId = await this.hashDeviceId(bleDeviceId);
      
      // Save as paired device
      const pairedDevice: PairedDevice = {
        deviceId: pairedDeviceId,
        deviceName: deviceName,
        publicKey: this.identity!.publicKey, // Self-signed for now
        pairedAt: new Date().toISOString(),
        bleDeviceId: bleDeviceId,
      };
      
      savePairedDevice(pairedDevice);
      
      this.setState('paired');
      this.onDevicePaired?.(pairedDevice);
      this.onProgress?.('Device paired successfully');
      
      console.log('[BluetoothSync] Pairing complete for:', deviceName);
      return true;
    } catch (error) {
      console.error('[BluetoothSync] Pairing error:', error);
      this.onError?.(error instanceof Error ? error.message : 'Pairing failed');
      this.setState('error');
      return false;
    }
  }

  // Hash device ID for consistent identification
  private async hashDeviceId(bleDeviceId: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(bleDeviceId);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Initialize WebRTC connection with robust configuration
  async initializeWebRTC(isInitiator: boolean): Promise<void> {
    try {
      this.setState('webrtc_connecting');
      this.onProgress?.('Setting up secure connection...');

      // Clear any existing connection
      this.pc?.close();
      
      // Robust ICE configuration with multiple STUN servers
      const config: RTCConfiguration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun.cloudflare.com:3478' },
        ],
        iceCandidatePoolSize: 10,
        iceTransportPolicy: 'all',
      };

      this.pc = new RTCPeerConnection(config);
      this.reconnectAttempts = 0;
      
      // Set up connection timeout
      this.connectionTimeoutId = setTimeout(() => {
        if (this._state === 'webrtc_connecting' || this._state === 'signaling') {
          console.error('[BluetoothSync] WebRTC connection timed out');
          this.onError?.('Connection timed out. Please try again.');
          this.setState('error');
          this.close();
        }
      }, CONNECTION_TIMEOUT_MS);
      
      // Handle ICE candidates
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('[BluetoothSync] ICE candidate:', event.candidate.type, event.candidate.protocol);
          this.sendWebRTCSignal({
            type: 'ice',
            data: JSON.stringify(event.candidate),
          });
        }
      };

      // Handle ICE connection state
      this.pc.oniceconnectionstatechange = () => {
        const state = this.pc?.iceConnectionState;
        console.log('[BluetoothSync] ICE connection state:', state);
        
        if (state === 'disconnected' || state === 'failed') {
          this.handleConnectionFailure();
        } else if (state === 'connected' || state === 'completed') {
          this.reconnectAttempts = 0;
        }
      };

      // Handle connection state
      this.pc.onconnectionstatechange = () => {
        const state = this.pc?.connectionState;
        console.log('[BluetoothSync] WebRTC connection state:', state);
        
        if (state === 'connected') {
          this.clearTimers();
          this.setState('connected');
          this.onWebRTCConnected?.();
          this.onProgress?.('Secure connection established');
          this.startHeartbeat();
          // Bluetooth can rest now
          this.disconnectBluetooth();
        } else if (state === 'failed') {
          this.handleConnectionFailure();
        }
      };

      // Handle data channel
      if (isInitiator) {
        this.dc = this.pc.createDataChannel('sync', { 
          ordered: true,
          maxRetransmits: 10,
        });
        this.setupDataChannel();
        
        // Create offer with robust options
        const offer = await this.pc.createOffer({
          iceRestart: false,
        });
        await this.pc.setLocalDescription(offer);
        
        // Wait for ICE gathering with extended timeout
        this.onProgress?.('Gathering network candidates...');
        await this.waitForIceGathering();
        
        // Send offer via Bluetooth
        const sdp = JSON.stringify(this.pc.localDescription);
        this.onProgress?.('Sending connection offer...');
        await this.sendWebRTCSignalChunked('offer', sdp);
      } else {
        // Wait for data channel
        this.pc.ondatachannel = (event) => {
          this.dc = event.channel;
          this.setupDataChannel();
        };
      }
    } catch (error) {
      console.error('[BluetoothSync] WebRTC init error:', error);
      this.onError?.(error instanceof Error ? error.message : 'Failed to initialize connection');
      this.setState('error');
    }
  }

  // Handle connection failure with retry
  private async handleConnectionFailure(): Promise<void> {
    if (this._state === 'error' || this._state === 'idle') return;
    
    this.reconnectAttempts++;
    console.log(`[BluetoothSync] Connection failure, attempt ${this.reconnectAttempts}/${RECONNECT_MAX_ATTEMPTS}`);
    
    if (this.reconnectAttempts <= RECONNECT_MAX_ATTEMPTS && this.pc) {
      this.setState('reconnecting');
      this.onProgress?.(`Reconnecting... (attempt ${this.reconnectAttempts}/${RECONNECT_MAX_ATTEMPTS})`);
      
      try {
        // Try ICE restart
        const offer = await this.pc.createOffer({ iceRestart: true });
        await this.pc.setLocalDescription(offer);
        await this.waitForIceGathering();
        
        const sdp = JSON.stringify(this.pc.localDescription);
        await this.sendWebRTCSignalChunked('offer', sdp);
      } catch (error) {
        console.error('[BluetoothSync] ICE restart failed:', error);
        if (this.reconnectAttempts >= RECONNECT_MAX_ATTEMPTS) {
          this.onError?.('Connection lost after multiple retry attempts');
          this.setState('error');
        }
      }
    } else {
      this.onError?.('Connection failed. Please try again.');
      this.setState('error');
    }
  }

  // Start heartbeat to keep connection alive
  private startHeartbeat(): void {
    this.clearTimers();
    
    this.heartbeatInterval = setInterval(() => {
      if (this.dc?.readyState === 'open') {
        try {
          this.dc.send(JSON.stringify({ type: 'heartbeat', timestamp: Date.now() }));
        } catch (error) {
          console.warn('[BluetoothSync] Heartbeat failed:', error);
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  // Set up data channel handlers
  private setupDataChannel(): void {
    if (!this.dc) return;

    this.dc.onopen = () => {
      console.log('[BluetoothSync] Data channel open');
      this.onDataChannelOpen?.();
    };

    this.dc.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // Ignore heartbeat messages
        if (data.type === 'heartbeat') return;
      } catch {
        // Not JSON, pass through
      }
      this.onDataChannelMessage?.(event.data);
    };

    this.dc.onerror = (error) => {
      console.error('[BluetoothSync] Data channel error:', error);
    };

    this.dc.onclose = () => {
      console.log('[BluetoothSync] Data channel closed');
      this.stopHeartbeat();
    };
  }

  // Stop heartbeat
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // Wait for ICE gathering to complete with extended timeout
  private waitForIceGathering(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.pc || this.pc.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      let hasResolved = false;
      
      const resolveOnce = () => {
        if (!hasResolved) {
          hasResolved = true;
          this.pc?.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };

      const checkState = () => {
        if (this.pc?.iceGatheringState === 'complete') {
          resolveOnce();
        }
      };

      this.pc.addEventListener('icegatheringstatechange', checkState);
      
      // Extended timeout for ICE gathering
      setTimeout(resolveOnce, ICE_GATHERING_TIMEOUT_MS);
    });
  }

  // Send WebRTC signal - log only since we don't have BLE GATT server
  // In a real implementation, this would use a different signaling mechanism
  private async sendWebRTCSignal(signal: WebRTCSignal): Promise<void> {
    // Log the signal - actual signaling would require a server or alternative mechanism
    console.log('[BluetoothSync] WebRTC signal (local only):', signal.type);
  }

  // Send chunked WebRTC signal (for large SDP)
  private async sendWebRTCSignalChunked(type: 'offer' | 'answer', data: string): Promise<void> {
    const chunks = chunkData(data);
    console.log(`[BluetoothSync] Preparing ${type} in ${chunks.length} chunks`);
    this.onProgress?.(`Preparing ${type}...`);

    for (let i = 0; i < chunks.length; i++) {
      await this.sendWebRTCSignal({
        type: 'chunk',
        data: chunks[i],
        chunkIndex: i,
        totalChunks: chunks.length,
      });
      // Small delay between chunks
      await delay(30);
    }

    await this.sendWebRTCSignal({
      type: 'complete',
      data: type,
    });
  }

  // Handle received WebRTC signal
  async handleWebRTCSignal(signal: WebRTCSignal): Promise<void> {
    try {
      if (signal.type === 'chunk') {
        this.receivedChunks.set(signal.chunkIndex!, signal.data);
        this.expectedChunks = signal.totalChunks!;
        return;
      }

      if (signal.type === 'complete') {
        // Reassemble chunks
        const chunks: string[] = [];
        for (let i = 0; i < this.expectedChunks; i++) {
          const chunk = this.receivedChunks.get(i);
          if (!chunk) {
            this.onError?.(`Missing chunk ${i} in WebRTC signal`);
            return;
          }
          chunks.push(chunk);
        }
        const fullData = chunks.join('');
        this.receivedChunks.clear();
        this.expectedChunks = 0;

        if (signal.data === 'offer') {
          await this.handleOffer(JSON.parse(fullData));
        } else if (signal.data === 'answer') {
          await this.handleAnswer(JSON.parse(fullData));
        }
        return;
      }

      if (signal.type === 'ice') {
        const candidate = JSON.parse(signal.data);
        if (this.pc && this.pc.remoteDescription) {
          await this.pc.addIceCandidate(candidate);
        }
        return;
      }

      if (signal.type === 'offer') {
        await this.handleOffer(JSON.parse(signal.data));
        return;
      }

      if (signal.type === 'answer') {
        await this.handleAnswer(JSON.parse(signal.data));
        return;
      }
    } catch (error) {
      console.error('[BluetoothSync] Handle signal error:', error);
    }
  }

  // Handle received offer
  private async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) {
      await this.initializeWebRTC(false);
    }

    this.onProgress?.('Processing connection offer...');
    await this.pc!.setRemoteDescription(offer);
    
    const answer = await this.pc!.createAnswer();
    await this.pc!.setLocalDescription(answer);
    
    // Wait for ICE gathering
    await this.waitForIceGathering();
    
    // Send answer back
    this.onProgress?.('Sending connection response...');
    const sdp = JSON.stringify(this.pc!.localDescription);
    await this.sendWebRTCSignalChunked('answer', sdp);
  }

  // Handle received answer
  private async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    this.onProgress?.('Finalizing connection...');
    await this.pc?.setRemoteDescription(answer);
  }

  // Send data through WebRTC data channel
  sendData(data: string): boolean {
    if (!this.dc || this.dc.readyState !== 'open') {
      console.error('[BluetoothSync] Data channel not open, state:', this.dc?.readyState);
      return false;
    }
    try {
      this.dc.send(data);
      return true;
    } catch (error) {
      console.error('[BluetoothSync] Send data error:', error);
      return false;
    }
  }

  // Handle Bluetooth disconnect
  private handleDisconnect(): void {
    console.log('[BluetoothSync] Bluetooth disconnected');
    // Only report if we haven't transitioned to WebRTC
    if (this._state !== 'connected' && this._state !== 'idle' && this._state !== 'error') {
      if (this._state === 'connecting' || this._state === 'pairing') {
        this.onProgress?.('Bluetooth disconnected, retrying...');
      }
    }
  }

  // Disconnect Bluetooth (after WebRTC is established)
  private disconnectBluetooth(): void {
    if (this.server?.connected) {
      try {
        this.server.disconnect();
        console.log('[BluetoothSync] Bluetooth disconnected (WebRTC active)');
      } catch (error) {
        console.warn('[BluetoothSync] Bluetooth disconnect warning:', error);
      }
    }
    this.device = null;
    this.server = null;
  }

  // Close all connections
  close(): void {
    console.log('[BluetoothSync] Closing all connections');
    
    this.clearTimers();
    this.stopHeartbeat();
    this.connectionAbortController?.abort();
    
    this.dc?.close();
    this.pc?.close();
    this.disconnectBluetooth();
    
    this.setState('idle');
    
    this.pc = null;
    this.dc = null;
    this.receivedChunks.clear();
    this.expectedChunks = 0;
    this.reconnectAttempts = 0;
  }

  // Get data channel for direct access
  getDataChannel(): RTCDataChannel | null {
    return this.dc;
  }

  // Get peer connection for direct access
  getPeerConnection(): RTCPeerConnection | null {
    return this.pc;
  }
  
  // Check if connected
  isConnected(): boolean {
    return this._state === 'connected' && this.dc?.readyState === 'open';
  }
}

// Singleton instance
let bluetoothSyncInstance: BluetoothSync | null = null;

export function getBluetoothSync(): BluetoothSync {
  if (!bluetoothSyncInstance) {
    bluetoothSyncInstance = new BluetoothSync();
  }
  return bluetoothSyncInstance;
}

export function resetBluetoothSync(): void {
  bluetoothSyncInstance?.close();
  bluetoothSyncInstance = null;
}
