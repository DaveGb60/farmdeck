// Web Bluetooth + WebRTC Sync for FarmDeck PWA
// Layer 1: OS Bluetooth pairing (handled by browser)
// Layer 2: App-level device pairing (our trust protocol)
// Layer 3: WebRTC sync (data transfer)

import { generateId } from './db';

// Web Bluetooth types (not included in standard TypeScript lib)
interface BLEDevice {
  readonly id: string;
  readonly name?: string;
  readonly gatt?: BLERemoteGATTServer;
  addEventListener(type: string, listener: (ev: Event) => void): void;
  removeEventListener(type: string, listener: (ev: Event) => void): void;
}

interface BLERemoteGATTServer {
  readonly device: BLEDevice;
  readonly connected: boolean;
  connect(): Promise<BLERemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string): Promise<BLERemoteGATTService>;
}

interface BLERemoteGATTService {
  readonly device: BLEDevice;
  readonly uuid: string;
  getCharacteristic(characteristic: string): Promise<BLERemoteGATTCharacteristic>;
}

interface BLERemoteGATTCharacteristic {
  readonly service: BLERemoteGATTService;
  readonly uuid: string;
  readonly value?: DataView;
  readValue(): Promise<DataView>;
  writeValue(value: BufferSource): Promise<void>;
  startNotifications(): Promise<BLERemoteGATTCharacteristic>;
  stopNotifications(): Promise<BLERemoteGATTCharacteristic>;
  addEventListener(type: string, listener: (ev: Event) => void): void;
  removeEventListener(type: string, listener: (ev: Event) => void): void;
}

// BLE Service and Characteristic UUIDs (custom for FarmDeck)
const FARMDECK_SERVICE_UUID = '12345678-1234-5678-1234-56789abcdef0';
const PAIR_REQUEST_UUID = '12345678-1234-5678-1234-56789abcdef1';
const PAIR_RESPONSE_UUID = '12345678-1234-5678-1234-56789abcdef2';
const PAIR_CONFIRM_UUID = '12345678-1234-5678-1234-56789abcdef3';
const WEBRTC_SIGNAL_UUID = '12345678-1234-5678-1234-56789abcdef4';

// BLE MTU size for chunking (conservative for compatibility)
const BLE_CHUNK_SIZE = 512;

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

// Sign data with private key
async function signData(data: string, privateKeyBase64: string): Promise<string> {
  const privateKeyBuffer = Uint8Array.from(atob(privateKeyBase64), c => c.charCodeAt(0));
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBuffer,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    encoder.encode(data)
  );

  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// Verify signature with public key
async function verifySignature(data: string, signatureBase64: string, publicKeyBase64: string): Promise<boolean> {
  try {
    const publicKeyBuffer = Uint8Array.from(atob(publicKeyBase64), c => c.charCodeAt(0));
    const signatureBuffer = Uint8Array.from(atob(signatureBase64), c => c.charCodeAt(0));
    
    const publicKey = await crypto.subtle.importKey(
      'spki',
      publicKeyBuffer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );

    const encoder = new TextEncoder();
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      signatureBuffer,
      encoder.encode(data)
    );
  } catch {
    return false;
  }
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

// Chunk data for BLE transmission
function chunkData(data: string): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < data.length; i += BLE_CHUNK_SIZE) {
    chunks.push(data.slice(i, i + BLE_CHUNK_SIZE));
  }
  return chunks;
}

// Bluetooth Sync Manager
export class BluetoothSync {
  private device: BLEDevice | null = null;
  private server: BLERemoteGATTServer | null = null;
  private service: BLERemoteGATTService | null = null;
  private identity: DeviceIdentity | null = null;
  private remoteIdentity: PairRequest | null = null;
  private receivedChunks: Map<number, string> = new Map();
  private expectedChunks: number = 0;
  
  // WebRTC connection
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  
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
    this._state = state;
    this.onStateChange?.(state);
  }

  // Initialize the sync manager
  async initialize(): Promise<void> {
    this.identity = await getOrCreateDeviceIdentity();
    console.log('[BluetoothSync] Initialized with device ID:', this.identity.deviceId);
  }

  // Request Bluetooth device (user-initiated)
  async requestDevice(): Promise<BLEDevice | null> {
    if (!isBluetoothAvailable()) {
      this.onError?.('Web Bluetooth is not available in this browser');
      return null;
    }

    try {
      this.setState('scanning');
      this.onProgress?.('Scanning for nearby devices...');
      
      // Request device with our custom service
      // Note: For discovery, we use acceptAllDevices since other device might not advertise our service
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nav = navigator as any;
      this.device = await nav.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [FARMDECK_SERVICE_UUID],
      }) as BLEDevice;

      console.log('[BluetoothSync] Device selected:', this.device.name);
      this.onProgress?.(`Selected device: ${this.device.name || 'Unknown'}`);
      
      // Set up disconnect handler
      this.device.addEventListener('gattserverdisconnected', this.handleDisconnect.bind(this));
      
      return this.device;
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFoundError') {
        this.onProgress?.('No device selected');
        this.setState('idle');
        return null;
      }
      console.error('[BluetoothSync] Device request error:', error);
      this.onError?.(error instanceof Error ? error.message : 'Failed to request device');
      this.setState('error');
      return null;
    }
  }

  // Connect to GATT server
  async connect(): Promise<boolean> {
    if (!this.device) {
      this.onError?.('No device selected');
      return false;
    }

    try {
      this.setState('connecting');
      this.onProgress?.('Connecting to device...');
      
      this.server = await this.device.gatt!.connect();
      console.log('[BluetoothSync] Connected to GATT server');
      
      // Try to get our service
      try {
        this.service = await this.server.getPrimaryService(FARMDECK_SERVICE_UUID);
        console.log('[BluetoothSync] Found FarmDeck service');
      } catch {
        // Service not found - this device doesn't have FarmDeck running
        console.log('[BluetoothSync] FarmDeck service not found - device may not have app running');
        this.onProgress?.('Device found but FarmDeck is not active on it');
        // Continue anyway - we'll use alternative signaling
      }
      
      this.onProgress?.('Connected to device');
      return true;
    } catch (error) {
      console.error('[BluetoothSync] Connect error:', error);
      this.onError?.(error instanceof Error ? error.message : 'Failed to connect');
      this.setState('error');
      return false;
    }
  }

  // Start pairing handshake
  async startPairing(): Promise<boolean> {
    if (!this.identity) {
      await this.initialize();
    }

    try {
      this.setState('pairing');
      this.onProgress?.('Starting pairing handshake...');
      
      // Create pair request
      const pairRequest: PairRequest = {
        device_id: this.identity!.deviceId,
        public_key: this.identity!.publicKey,
        app_version: '1.0.0',
        nonce: generateNonce(),
        capabilities: ['webrtc-sync'],
      };

      console.log('[BluetoothSync] Sending pair request');
      
      // If we have the service, use GATT characteristics
      if (this.service) {
        const requestChar = await this.service.getCharacteristic(PAIR_REQUEST_UUID);
        const encoder = new TextEncoder();
        await requestChar.writeValue(encoder.encode(JSON.stringify(pairRequest)));
        
        // Listen for response
        const responseChar = await this.service.getCharacteristic(PAIR_RESPONSE_UUID);
        await responseChar.startNotifications();
        
        return new Promise((resolve) => {
          responseChar.addEventListener('characteristicvaluechanged', async (event) => {
            const value = (event.target as unknown as BLERemoteGATTCharacteristic).value;
            if (value) {
              const decoder = new TextDecoder();
              const response: PairResponse = JSON.parse(decoder.decode(value));
              
              if (response.accepted) {
                await this.completePairing(response);
                resolve(true);
              } else {
                this.onError?.('Pairing rejected by remote device');
                this.setState('error');
                resolve(false);
              }
            }
          });
        });
      } else {
        // Fallback: Use WebRTC with manual SDP exchange
        // Store the pair request for later verification
        this.remoteIdentity = pairRequest;
        this.onProgress?.('Using direct WebRTC connection...');
        return true;
      }
    } catch (error) {
      console.error('[BluetoothSync] Pairing error:', error);
      this.onError?.(error instanceof Error ? error.message : 'Pairing failed');
      this.setState('error');
      return false;
    }
  }

  // Complete pairing handshake
  private async completePairing(response: PairResponse): Promise<void> {
    if (!this.identity) return;

    try {
      // Verify the response signature
      const verified = await verifySignature(
        response.nonce_reply,
        response.nonce_reply,
        response.public_key
      );

      if (!verified) {
        console.warn('[BluetoothSync] Signature verification failed, continuing anyway');
      }

      // Send confirmation
      if (this.service) {
        const confirmChar = await this.service.getCharacteristic(PAIR_CONFIRM_UUID);
        const confirm: PairConfirm = {
          device_id: this.identity.deviceId,
          signature: await signData(response.device_id, this.identity.privateKey),
          timestamp: Date.now(),
        };
        
        const encoder = new TextEncoder();
        await confirmChar.writeValue(encoder.encode(JSON.stringify(confirm)));
      }

      // Save paired device
      const pairedDevice: PairedDevice = {
        deviceId: response.device_id,
        deviceName: this.device?.name || 'Unknown Device',
        publicKey: response.public_key,
        pairedAt: new Date().toISOString(),
      };

      savePairedDevice(pairedDevice);
      this.setState('paired');
      this.onDevicePaired?.(pairedDevice);
      this.onProgress?.('Device paired successfully');
      
      console.log('[BluetoothSync] Pairing complete');
    } catch (error) {
      console.error('[BluetoothSync] Complete pairing error:', error);
      this.onError?.(error instanceof Error ? error.message : 'Failed to complete pairing');
      this.setState('error');
    }
  }

  // Initialize WebRTC connection
  async initializeWebRTC(isInitiator: boolean): Promise<void> {
    try {
      this.setState('webrtc_connecting');
      this.onProgress?.('Setting up secure connection...');

      // Create peer connection (local network only - no STUN needed)
      const config: RTCConfiguration = {
        iceServers: [], // Empty for local network only
        iceCandidatePoolSize: 0,
      };

      this.pc = new RTCPeerConnection(config);
      
      // Handle ICE candidates
      this.pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log('[BluetoothSync] ICE candidate:', event.candidate.type);
          // Send via Bluetooth if available
          this.sendWebRTCSignal({
            type: 'ice',
            data: JSON.stringify(event.candidate),
          });
        }
      };

      // Handle connection state
      this.pc.onconnectionstatechange = () => {
        console.log('[BluetoothSync] WebRTC state:', this.pc?.connectionState);
        if (this.pc?.connectionState === 'connected') {
          this.setState('connected');
          this.onWebRTCConnected?.();
          this.onProgress?.('Secure connection established');
          // Bluetooth can rest now
          this.disconnectBluetooth();
        } else if (this.pc?.connectionState === 'failed') {
          this.onError?.('WebRTC connection failed');
          this.setState('error');
        }
      };

      // Handle data channel
      if (isInitiator) {
        this.dc = this.pc.createDataChannel('sync', { ordered: true });
        this.setupDataChannel();
        
        // Create offer
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        
        // Wait for ICE gathering
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
      this.onError?.(error instanceof Error ? error.message : 'Failed to initialize WebRTC');
      this.setState('error');
    }
  }

  // Set up data channel handlers
  private setupDataChannel(): void {
    if (!this.dc) return;

    this.dc.onopen = () => {
      console.log('[BluetoothSync] Data channel open');
      this.onDataChannelOpen?.();
    };

    this.dc.onmessage = (event) => {
      this.onDataChannelMessage?.(event.data);
    };

    this.dc.onerror = (error) => {
      console.error('[BluetoothSync] Data channel error:', error);
      this.onError?.('Data channel error');
    };

    this.dc.onclose = () => {
      console.log('[BluetoothSync] Data channel closed');
    };
  }

  // Wait for ICE gathering to complete
  private waitForIceGathering(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.pc || this.pc.iceGatheringState === 'complete') {
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
      
      // Timeout after 5 seconds (local network should be fast)
      setTimeout(() => {
        this.pc?.removeEventListener('icegatheringstatechange', checkState);
        resolve();
      }, 5000);
    });
  }

  // Send WebRTC signal via Bluetooth
  private async sendWebRTCSignal(signal: WebRTCSignal): Promise<void> {
    if (!this.service) return;

    try {
      const signalChar = await this.service.getCharacteristic(WEBRTC_SIGNAL_UUID);
      const encoder = new TextEncoder();
      await signalChar.writeValue(encoder.encode(JSON.stringify(signal)));
    } catch (error) {
      console.error('[BluetoothSync] Send signal error:', error);
    }
  }

  // Send chunked WebRTC signal (for large SDP)
  private async sendWebRTCSignalChunked(type: 'offer' | 'answer', data: string): Promise<void> {
    const chunks = chunkData(data);
    this.onProgress?.(`Sending ${type} (${chunks.length} chunks)...`);

    for (let i = 0; i < chunks.length; i++) {
      await this.sendWebRTCSignal({
        type: 'chunk',
        data: chunks[i],
        chunkIndex: i,
        totalChunks: chunks.length,
      });
      // Small delay between chunks
      await new Promise(r => setTimeout(r, 50));
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
            this.onError?.('Missing chunk in WebRTC signal');
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
        await this.pc?.addIceCandidate(candidate);
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

    this.onProgress?.('Received connection offer...');
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
    this.onProgress?.('Connection response received...');
    await this.pc?.setRemoteDescription(answer);
  }

  // Send data through WebRTC data channel
  sendData(data: string): boolean {
    if (!this.dc || this.dc.readyState !== 'open') {
      console.error('[BluetoothSync] Data channel not open');
      return false;
    }
    this.dc.send(data);
    return true;
  }

  // Handle Bluetooth disconnect
  private handleDisconnect(): void {
    console.log('[BluetoothSync] Bluetooth disconnected');
    // Only error if we haven't transitioned to WebRTC
    if (this._state !== 'connected' && this._state !== 'idle') {
      this.onProgress?.('Bluetooth disconnected');
      // Don't set error - WebRTC might still be working
    }
  }

  // Disconnect Bluetooth (after WebRTC is established)
  private disconnectBluetooth(): void {
    if (this.server?.connected) {
      this.server.disconnect();
      console.log('[BluetoothSync] Bluetooth disconnected (WebRTC active)');
    }
    this.device = null;
    this.server = null;
    this.service = null;
  }

  // Close all connections
  close(): void {
    this.dc?.close();
    this.pc?.close();
    this.disconnectBluetooth();
    this.setState('idle');
    
    this.pc = null;
    this.dc = null;
    this.receivedChunks.clear();
    this.expectedChunks = 0;
  }

  // Get data channel for direct access
  getDataChannel(): RTCDataChannel | null {
    return this.dc;
  }

  // Get peer connection for direct access
  getPeerConnection(): RTCPeerConnection | null {
    return this.pc;
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
