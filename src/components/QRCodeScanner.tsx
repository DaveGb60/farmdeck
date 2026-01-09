import { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';
import { Button } from '@/components/ui/button';
import { Camera, CameraOff, RefreshCw, AlertCircle } from 'lucide-react';

interface QRCodeScannerProps {
  onScan: (data: string) => void;
  onError?: (error: string) => void;
  scanning?: boolean;
  autoStart?: boolean; // New prop - default false, user must click to start
}

export function QRCodeScanner({ onScan, onError, scanning = true, autoStart = false }: QRCodeScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [userInitiated, setUserInitiated] = useState(autoStart);
  const mountedRef = useRef(true);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
          await scannerRef.current.stop();
        }
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      }
    }
    setIsScanning(false);
  }, []);

  const startScanner = useCallback(async (cameraId?: string) => {
    if (!containerRef.current || !mountedRef.current) return;

    setError(null);
    
    try {
      // Get available cameras
      const devices = await Html5Qrcode.getCameras();
      if (!mountedRef.current) return;
      
      if (devices.length === 0) {
        setError('No camera found');
        setHasPermission(false);
        return;
      }

      setCameras(devices);
      setHasPermission(true);

      // Prefer back camera on mobile
      let selectedCamera = cameraId || devices[0].id;
      if (!cameraId) {
        const backCamera = devices.find(d => 
          d.label.toLowerCase().includes('back') || 
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('environment')
        );
        if (backCamera) {
          selectedCamera = backCamera.id;
          setCurrentCameraIndex(devices.findIndex(d => d.id === backCamera.id));
        }
      }

      // Create scanner instance
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode('qr-scanner-container');
      }

      // Start scanning
      await scannerRef.current.start(
        selectedCamera,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1,
        },
        (decodedText) => {
          if (mountedRef.current) {
            onScan(decodedText);
            stopScanner();
          }
        },
        () => {
          // QR code scan error - ignore, keep scanning
        }
      );

      if (mountedRef.current) {
        setIsScanning(true);
      }
    } catch (err) {
      console.error('Camera error:', err);
      if (mountedRef.current) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to access camera';
        setError(errorMessage);
        setHasPermission(false);
        onError?.(errorMessage);
      }
    }
  }, [onScan, onError, stopScanner]);

  const switchCamera = useCallback(async () => {
    if (cameras.length <= 1) return;
    
    await stopScanner();
    const nextIndex = (currentCameraIndex + 1) % cameras.length;
    setCurrentCameraIndex(nextIndex);
    await startScanner(cameras[nextIndex].id);
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
      setUserInitiated(autoStart); // Reset when scanning is disabled
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
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
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
        ref={containerRef}
        className="relative overflow-hidden rounded-lg bg-black"
        style={{ minHeight: '280px' }}
      >
        <div id="qr-scanner-container" className="w-full" />
        
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
            <div className="absolute top-1/2 left-1/2 w-[260px] h-[260px] -translate-x-1/2 -translate-y-1/2">
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
