import { createSignal, onMount, Show } from 'solid-js';
import './App.css';

const BACKEND_URL = 'http://localhost:3001/api/scan';

function App() {
	let videoRef: HTMLVideoElement | undefined;

	// State signals
	const [hasScanned, setHasScanned] = createSignal(false);
	const [isProcessing, setIsProcessing] = createSignal(false);
	const [ackStatus, setAckStatus] = createSignal<'idle' | 'pending' | 'success' | 'failed'>('idle');
	const [statusMessage, setStatusMessage] = createSignal<string>('');
	const [isPlaying, setIsPlaying] = createSignal(false);

	onMount(async () => {
		try {
			const stream: MediaStream = await navigator.mediaDevices.getUserMedia({
				video: {
					width: { ideal: 1920 },
					height: { ideal: 1080 },
					facingMode: 'environment',
				},
				audio: false,
			});

			if (videoRef) {
				videoRef.srcObject = stream;
				await videoRef.play();
			}
		} catch (err) {
			console.error('Cannot access camera stream:', err);
			setStatusMessage('Camera error: Unable to access camera device');
		}
	});

	// Capture photo and communicate with backend protocol
	const handleScanDocument = async () => {
		if (!videoRef || isProcessing()) return;

		try {
			setIsProcessing(true);
			setAckStatus('pending');
			setStatusMessage('Capturing photo and sending to backend...');

			// 1. Freeze the camera feed
			videoRef.pause();

			// 2. Take photo via an offscreen canvas
			const canvas = document.createElement('canvas');
			canvas.width = videoRef.videoWidth || 1280;
			canvas.height = videoRef.videoHeight || 720;
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				throw new Error('Failed to create canvas 2D context');
			}
			ctx.drawImage(videoRef, 0, 0, canvas.width, canvas.height);

			// 3. Convert frame to JPEG Blob
			const blob = await new Promise<Blob | null>((resolve) => {
				canvas.toBlob(resolve, 'image/jpeg', 0.92);
			});

			if (!blob) {
				throw new Error('Failed to generate image file blob from video stream');
			}

			// 4. Prepare multipart/form-data payload for cognibridge-backend
			const formData = new FormData();
			const timestamp = Date.now();
			formData.append('photo', blob, `document_${timestamp}.jpg`);

			// 5. Send to cognibridge-backend
			const response = await fetch(BACKEND_URL, {
				method: 'POST',
				body: formData,
			});

			if (!response.ok) {
				throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
			}

			const data = await response.json();

			// 6. Verify backend protocol ACK
			if (data.status === 'ACK') {
				console.log('Backend ACK success', data);
				setAckStatus('success');
				setStatusMessage(`Backend ACK success — received ${Math.round(data.bytes_received / 1024)} KB`);
				// Reveal media control buttons upon successful scan & ACK
				setHasScanned(true);
				setIsPlaying(false);
			} else {
				console.error('No ACK: failed', data);
				setAckStatus('failed');
				setStatusMessage('No ACK: failed');
			}
		} catch (err) {
			console.error('No ACK: failed', err);
			setAckStatus('failed');
			setStatusMessage('No ACK: failed — Backend unreachable or rejected payload');
		} finally {
			setIsProcessing(false);
		}
	};

	// Reset to scan another document
	const handleRetake = async () => {
		if (videoRef) {
			try {
				await videoRef.play();
			} catch (err) {
				console.error('Error resuming video:', err);
			}
		}
		setHasScanned(false);
		setAckStatus('idle');
		setStatusMessage('');
	};

	// Toggle play/pause for the media controls
	const togglePlayPause = async () => {
		if (!videoRef) return;
		if (videoRef.paused) {
			await videoRef.play();
			setIsPlaying(true);
		} else {
			videoRef.pause();
			setIsPlaying(false);
		}
	};

	return (
		<div class="app-container">
			{/* Camera Feed */}
			<video class="camera-feed" ref={videoRef} autoplay playsinline muted />

			{/* Status Banner */}
			<Show when={ackStatus() !== 'idle'}>
				<div class={`status-banner status-${ackStatus()}`}>
					<div class="status-indicator" />
					<span class="status-text">{statusMessage()}</span>
					<Show when={ackStatus() === 'failed'}>
						<button class="status-retry-btn" onClick={handleScanDocument}>
							Retry
						</button>
					</Show>
				</div>
			</Show>

			{/* Viewfinder Overlay (shown before scanning) */}
			<Show when={!hasScanned()}>
				<div class="viewfinder-guide">
					<div class="corner top-left" />
					<div class="corner top-right" />
					<div class="corner bottom-left" />
					<div class="corner bottom-right" />
					<div class="guide-text">Align document within frame</div>
				</div>
			</Show>

			{/* Frozen Feed Indicator (shown after scanning) */}
			<Show when={hasScanned()}>
				<div class="feed-badge">
					<span class="badge-dot" />
					<span>Feed Frozen (Photo Captured)</span>
				</div>
			</Show>

			{/* Settings Button */}
			<button
				class="settings-btn"
				title="Settings"
				onClick={() => console.log('settings-btn pressed')}
			>
				⚙️
			</button>

			{/* INITIAL STATE: Big "SCAN DOCUMENT" Button */}
			<Show when={!hasScanned()}>
				<div class="scan-button-wrapper">
					<button
						class="scan-document-btn"
						disabled={isProcessing()}
						onClick={handleScanDocument}
					>
						<span class="scan-btn-icon">
							<Show when={isProcessing()} fallback="📸">
								⏳
							</Show>
						</span>
						<span class="scan-btn-text">
							{isProcessing() ? 'PROCESSING...' : 'SCAN DOCUMENT'}
						</span>
					</button>
				</div>
			</Show>

			{/* AFTER SCAN: Media Playback Controls & Retake */}
			<Show when={hasScanned()}>
				<div class="playback-panel">
					<button class="retake-btn" onClick={handleRetake} title="Retake or scan another document">
						↺ Scan Another Document
					</button>
					<div class="playback-controls">
						<button
							class="control-btn"
							title="Rewind"
							onClick={() => console.log('Rewind clicked')}
						>
							⏪
						</button>
						<button
							class="control-btn playpause"
							title={isPlaying() ? 'Pause' : 'Play'}
							onClick={togglePlayPause}
						>
							{isPlaying() ? '⏸️' : '▶️'}
						</button>
						<button
							class="control-btn"
							title="Fast Forward"
							onClick={() => console.log('Fast Forward clicked')}
						>
							⏩
						</button>
					</div>
				</div>
			</Show>
		</div>
	);
}

export default App;
