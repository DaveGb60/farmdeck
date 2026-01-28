import { useEffect, useRef, useState, useCallback } from 'react';
import jsQR from 'jsqr';
import { Button } from '@/components/ui/button';
import { Camera, CameraOff, RefreshCw, AlertCircle } from 'lucide-react';

interface QRCodeScannerProps {
  onScan: (data: string) => void;
  onError?: (error: string) => void;
  scanning?: boolean;
  autoStart?: boolean;
}

export function QRCodeScanner({ onScan, onError, scanning = true, autoStart = false }: QRCodeScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const hasScannedRef = useRef(false);
  
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [userInitiated, setUserInitiated] = useState(autoStart);

  const stopScanner = useCallback(() => {
    console.log('[QRScanner] Stopping scanner...');
    
    // Cancel animation frame
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = 0;
    }
    
    // Stop media stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('[QRScanner] Stopped track:', track.kind);
      });
      streamRef.current = null;
    }
    
    // Clear video
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsScanning(false);
  }, []);

  const scanFrame = useCallback(() => {
    if (!mountedRef.current || !videoRef.current || !canvasRef.current || hasScannedRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
      animationRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // Draw current frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Try to decode QR code
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });
    
    if (code && code.data) {
      console.log('[QRScanner] QR code detected:', code.data.substring(0, 50) + '...');
      hasScannedRef.current = true;
      
      // Stop scanner before calling callback
      stopScanner();
      
      // Call onScan after a small delay to ensure clean state
      setTimeout(() => {
        if (mountedRef.current) {
          onScan(code.data);
        }
      }, 50);
      return;
    }
    
    // Continue scanning
    animationRef.current = requestAnimationFrame(scanFrame);
  }, [onScan, stopScanner]);

  const startScanner = useCallback(async (deviceId?: string) => {
    if (!mountedRef.current) return;
    
    console.log('[QRScanner] Starting scanner...');
    setError(null);
    hasScannedRef.current = false;
    
    try {
      // Get available cameras
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      
      if (videoDevices.length === 0) {
        throw new Error('No camera found');
      }
      
      setCameras(videoDevices);
      setHasPermission(true);
      
      // Prefer back camera on mobile
      let selectedDeviceId = deviceId;
      if (!deviceId) {
        const backCamera = videoDevices.find(d => 
          d.label.toLowerCase().includes('back') || 
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('environment')
        );
        if (backCamera) {
          selectedDeviceId = backCamera.deviceId;
          setCurrentCameraIndex(videoDevices.findIndex(d => d.deviceId === backCamera.deviceId));
        } else {
          selectedDeviceId = videoDevices[0].deviceId;
        }
      }
      
      // Request camera access
      const constraints: MediaStreamConstraints = {
        video: {
          deviceId: selectedDeviceId ? { exact: selectedDeviceId } : undefined,
          facingMode: selectedDeviceId ? undefined : { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        }
      };
      
      console.log('[QRScanner] Requesting camera with constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      
      if (!mountedRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        
        await videoRef.current.play();
        console.log('[QRScanner] Video playing');
        
        setIsScanning(true);
        
        // Start scanning loop
        animationRef.current = requestAnimationFrame(scanFrame);
      }
    } catch (err) {
      console.error('[QRScanner] Camera error:', err);
      
      if (!mountedRef.current) return;
      
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
      hasScannedRef.current = true; // Prevent any pending callbacks
      
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
        style={{ minHeight: '280px' }}
      >
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          playsInline
          muted
          style={{ minHeight: '280px' }}
        />
        
        {/* Hidden canvas for image processing */}
        <canvas ref={canvasRef} className="hidden" />
        
        {!isScanning && hasPermission === null && userInitiated && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-muted">
            <Camera className="h-10 w-10 text-muted-foreground animate-pulse" />
            <p className="text-sm text-muted-foreground">Starting camera...</p>
          </div>
        )}
        
        {/* Scanning overlay */}
        {isScanning && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Corner markers */}
            <div className="absolute top-1/2 left-1/2 w-[200px] h-[200px] -translate-x-1/2 -translate-y-1/2">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-lg" />
              
              {/* Scanning line animation */}
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary animate-scan" />
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
        Point camera at the QR code on the other device
      </p>
    </div>
  );
}
