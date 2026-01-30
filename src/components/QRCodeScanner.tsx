import { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import { Button } from '@/components/ui/button';
import { Camera, CameraOff, RefreshCw, AlertCircle, Zap } from 'lucide-react';

interface QRCodeScannerProps {
  onScan: (data: string) => void;
  onError?: (error: string) => void;
  scanning?: boolean;
  autoStart?: boolean;
}

// Optimized scanning configuration
const SCAN_CONFIG = {
  targetFPS: 30,          // Higher FPS for faster detection
  scanInterval: 33,       // ~30fps scanning (1000/30)
  minResolution: 720,     // Minimum video resolution
  idealResolution: 1080,  // Ideal video resolution
  maxResolution: 1920,    // Maximum video resolution
  scanBoxRatio: 0.75,     // QR box occupies 75% of viewport
  retryAttempts: 3,       // Camera retry attempts
  retryDelay: 500,        // Delay between retries
};

export function QRCodeScanner({ onScan, onError, scanning = true, autoStart = false }: QRCodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>(0);
  const lastScanTimeRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const hasScannedRef = useRef(false);
  const retryCountRef = useRef(0);
  
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [userInitiated, setUserInitiated] = useState(autoStart);
  const [scanAttempts, setScanAttempts] = useState(0);

  const stopScanner = useCallback(() => {
    console.log('[QRScanner] Stopping scanner...');
    
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = 0;
    }
    
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('[QRScanner] Stopped track:', track.kind);
      });
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsScanning(false);
  }, []);

  const scanFrame = useCallback(() => {
    if (!mountedRef.current || !videoRef.current || !canvasRef.current || hasScannedRef.current) {
      return;
    }

    const now = performance.now();
    const timeSinceLastScan = now - lastScanTimeRef.current;
    
    // Throttle scanning to target FPS
    if (timeSinceLastScan < SCAN_CONFIG.scanInterval) {
      animationRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    
    lastScanTimeRef.current = now;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animationRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    // Set canvas size to match video for better quality
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;
    
    if (videoWidth === 0 || videoHeight === 0) {
      animationRef.current = requestAnimationFrame(scanFrame);
      return;
    }
    
    canvas.width = videoWidth;
    canvas.height = videoHeight;
    
    // Draw current frame at full resolution
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Get image data from full frame
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Try to decode QR code with multiple inversion attempts for better detection
    let code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'attemptBoth', // Try both normal and inverted for better detection
    });
    
    // If not found, try with just the center region (common QR placement)
    if (!code) {
      const centerSize = Math.min(videoWidth, videoHeight) * SCAN_CONFIG.scanBoxRatio;
      const centerX = (videoWidth - centerSize) / 2;
      const centerY = (videoHeight - centerSize) / 2;
      
      const centerImageData = ctx.getImageData(
        centerX, 
        centerY, 
        centerSize, 
        centerSize
      );
      
      code = jsQR(centerImageData.data, centerImageData.width, centerImageData.height, {
        inversionAttempts: 'attemptBoth',
      });
    }
    
    if (code && code.data) {
      console.log('[QRScanner] QR code detected:', code.data.substring(0, 50) + '...');
      hasScannedRef.current = true;
      
      stopScanner();
      
      setTimeout(() => {
        if (mountedRef.current) {
          onScan(code.data);
        }
      }, 50);
      return;
    }
    
    // Track scan attempts for UI feedback
    setScanAttempts(prev => prev + 1);
    
    animationRef.current = requestAnimationFrame(scanFrame);
  }, [onScan, stopScanner]);

  const startScanner = useCallback(async (deviceId?: string) => {
    if (!mountedRef.current) return;
    
    console.log('[QRScanner] Starting scanner with enhanced settings...');
    setError(null);
    hasScannedRef.current = false;
    setScanAttempts(0);
    
    try {
      // Get available cameras
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      
      if (videoDevices.length === 0) {
        throw new Error('No camera found');
      }
      
      setCameras(videoDevices);
      setHasPermission(true);
      
      // Prefer back camera on mobile with better selection logic
      let selectedDeviceId = deviceId;
      if (!deviceId) {
        // Priority: environment-facing > back > rear > first available
        const backCamera = videoDevices.find(d => {
          const label = d.label.toLowerCase();
          return label.includes('environment') || 
                 label.includes('back') || 
                 label.includes('rear') ||
                 label.includes('world');
        });
        if (backCamera) {
          selectedDeviceId = backCamera.deviceId;
          setCurrentCameraIndex(videoDevices.findIndex(d => d.deviceId === backCamera.deviceId));
        } else {
          selectedDeviceId = videoDevices[0].deviceId;
        }
      }
      
      // Enhanced camera constraints for better quality
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          facingMode: selectedDeviceId ? undefined : { ideal: 'environment' },
          width: { 
            min: SCAN_CONFIG.minResolution, 
            ideal: SCAN_CONFIG.idealResolution,
            max: SCAN_CONFIG.maxResolution 
          },
          height: { 
            min: SCAN_CONFIG.minResolution, 
            ideal: SCAN_CONFIG.idealResolution,
            max: SCAN_CONFIG.maxResolution 
          },
          frameRate: { ideal: SCAN_CONFIG.targetFPS, max: 60 },
        }
      };
      
      console.log('[QRScanner] Requesting camera with enhanced constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (!mountedRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      
      streamRef.current = stream;
      retryCountRef.current = 0;
      
      // Log actual camera capabilities
      const videoTrack = stream.getVideoTracks()[0];
      const settings = videoTrack.getSettings();
      console.log('[QRScanner] Camera settings:', {
        width: settings.width,
        height: settings.height,
        frameRate: settings.frameRate,
        facingMode: settings.facingMode,
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        
        await videoRef.current.play();
        console.log('[QRScanner] Video playing at', settings.width, 'x', settings.height);
        
        setIsScanning(true);
        lastScanTimeRef.current = performance.now();
        animationRef.current = requestAnimationFrame(scanFrame);
      }
    } catch (err) {
      console.error('[QRScanner] Camera error:', err);
      
      if (!mountedRef.current) return;
      
      // Retry logic for transient errors
      if (retryCountRef.current < SCAN_CONFIG.retryAttempts) {
        retryCountRef.current++;
        console.log(`[QRScanner] Retrying... (${retryCountRef.current}/${SCAN_CONFIG.retryAttempts})`);
        setTimeout(() => startScanner(deviceId), SCAN_CONFIG.retryDelay);
        return;
      }
      
      const errorMessage = err instanceof Error ? err.message : 'Failed to access camera';
      setError(errorMessage);
      setHasPermission(false);
      onError?.(errorMessage);
    }
  }, [scanFrame, onError]);

  const switchCamera = useCallback(async () => {
    if (cameras.length <= 1) return;
    
    stopScanner();
    const nextIndex = (currentCameraIndex + 1) % cameras.length;
    setCurrentCameraIndex(nextIndex);
    await startScanner(cameras[nextIndex].deviceId);
  }, [cameras, currentCameraIndex, stopScanner, startScanner]);

  const retryPermission = useCallback(() => {
    setError(null);
    setHasPermission(null);
    setUserInitiated(true);
    retryCountRef.current = 0;
    startScanner();
  }, [startScanner]);

  const handleStartScanning = useCallback(() => {
    setUserInitiated(true);
    startScanner();
  }, [startScanner]);

  // Start/stop based on scanning prop AND user initiation
  useEffect(() => {
    mountedRef.current = true;
    
    if (scanning && userInitiated) {
      startScanner();
    } else if (!scanning) {
      stopScanner();
      setUserInitiated(autoStart);
    }

    return () => {
      mountedRef.current = false;
      stopScanner();
    };
  }, [scanning, userInitiated, autoStart, startScanner, stopScanner]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      hasScannedRef.current = true;
      
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  if (error || hasPermission === false) {
    return (
      <div className="flex flex-col items-center justify-center p-6 bg-muted/50 rounded-lg border-2 border-dashed gap-4">
        <div className="p-3 rounded-full bg-destructive/10">
          <CameraOff className="h-8 w-8 text-destructive" />
        </div>
        <div className="text-center">
          <p className="font-medium text-destructive">Camera Access Required</p>
          <p className="text-sm text-muted-foreground mt-1">
            {error || 'Please allow camera access to scan QR codes'}
          </p>
        </div>
        <Button onClick={retryPermission} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 mr-2" />
          Try Again
        </Button>
      </div>
    );
  }

  // Show "Start Scanning" button if user hasn't initiated yet
  if (!userInitiated && scanning) {
    return (
      <div className="flex flex-col items-center justify-center p-8 bg-muted/50 rounded-lg border-2 border-dashed gap-4">
        <div className="p-4 rounded-full bg-primary/10">
          <Camera className="h-10 w-10 text-primary" />
        </div>
        <div className="text-center">
          <p className="font-medium">Ready to Scan</p>
          <p className="text-sm text-muted-foreground mt-1">
            Tap the button below to open your camera
          </p>
        </div>
        <Button onClick={handleStartScanning} className="gap-2">
          <Camera className="h-4 w-4" />
          Start Camera
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div 
        className="relative overflow-hidden rounded-lg bg-black"
        style={{ minHeight: '320px' }}
      >
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
          style={{ minHeight: '320px' }}
        />
        
        {/* Hidden canvas for image processing */}
        <canvas ref={canvasRef} className="hidden" />
        
        {!isScanning && hasPermission === null && userInitiated && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted">
            <Camera className="h-10 w-10 text-muted-foreground animate-pulse" />
            <p className="text-sm text-muted-foreground">Starting camera...</p>
          </div>
        )}
        
        {/* Scanning overlay with larger target area */}
        {isScanning && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Dimmed edges */}
            <div className="absolute inset-0 bg-black/30" />
            
            {/* Clear scanning area - larger for better UX */}
            <div className="absolute top-1/2 left-1/2 w-[240px] h-[240px] -translate-x-1/2 -translate-y-1/2">
              {/* Clear center */}
              <div className="absolute inset-0 bg-transparent" style={{ 
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.3)'
              }} />
              
              {/* Corner markers - thicker for visibility */}
              <div className="absolute top-0 left-0 w-10 h-10 border-t-4 border-l-4 border-primary rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-10 h-10 border-t-4 border-r-4 border-primary rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-10 h-10 border-b-4 border-l-4 border-primary rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-10 h-10 border-b-4 border-r-4 border-primary rounded-br-lg" />
              
              {/* Scanning line animation */}
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-primary to-transparent animate-scan" />
            </div>
            
            {/* Scanning indicator */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 text-white px-3 py-1.5 rounded-full text-xs">
              <Zap className="h-3 w-3 animate-pulse text-primary" />
              <span>Scanning...</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Camera controls */}
      {cameras.length > 1 && isScanning && (
        <Button 
          onClick={switchCamera} 
          variant="outline" 
          size="sm" 
          className="w-full"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Switch Camera ({currentCameraIndex + 1}/{cameras.length})
        </Button>
      )}
      
      <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
        <AlertCircle className="h-3 w-3" />
        Position QR code within the frame for best results
      </p>
    </div>
  );
}
