// 1. IMPORTS
// We import functions from 'solid-js':
// - createSignal: creates reactive variables (state) that re-render parts of the screen when changed.
// - onMount: a lifecycle hook that runs code once when the component first appears on screen.
// - Show: a SolidJS helper component that conditionally renders HTML (like an if/else in HTML).
import { createSignal, onMount, Show } from 'solid-js';

// We import the CSS styles for this component.
import './App.css';

// The URL of our Rust backend endpoint where photos are uploaded.
const BACKEND_URL = 'http://localhost:3001/api/scan';

// The main App component function.
function App() {
	// A reference variable to hold the actual <video> DOM element so we can control it.
	let videoRef: HTMLVideoElement | undefined;

	// ==========================================
	// REACTIVE STATE (SIGNALS)
	// In SolidJS, signals hold data that can change over time.
	// Syntax: const [getter, setter] = createSignal(initialValue);
	// ==========================================

	// Tracks whether a document has been scanned (false = initial screen, true = show playback controls)
	const [hasScanned, setHasScanned] = createSignal(false);

	// Tracks if a photo is currently being processed or uploaded (prevents double-clicks)
	const [isProcessing, setIsProcessing] = createSignal(false);

	// Tracks the status of backend acknowledgment: 'idle', 'pending', 'success', or 'failed'
	const [ackStatus, setAckStatus] = createSignal<'idle' | 'pending' | 'success' | 'failed'>('idle');

	// Text message to show the user in the status banner at the top
	const [statusMessage, setStatusMessage] = createSignal<string>('');

	// Tracks if the video is currently playing or paused during playback mode
	const [isPlaying, setIsPlaying] = createSignal(false);

	// ==========================================
	// LIFECYCLE: onMount
	// Runs once when the page is loaded into the browser.
	// ==========================================
	onMount(async () => {
		try {
			// Ask the browser for permission to use the user's camera
			const stream: MediaStream = await navigator.mediaDevices.getUserMedia({
				video: {
					width: { ideal: 1920 }, // Prefer high resolution (1080p)
					height: { ideal: 1080 },
					facingMode: 'environment', // Prefer back camera on mobile devices
				},
				audio: false, // We only need the video feed, no microphone
			});

			// If the <video> tag is ready in the DOM, connect the camera stream to it
			if (videoRef) {
				videoRef.srcObject = stream; // Attach webcam stream
				await videoRef.play(); // Start streaming video
			}
		} catch (err) {
			// If user denies permission or no camera is found, log an error
			console.error('Cannot access camera stream:', err);
			setStatusMessage('Camera error: Unable to access camera device');
		}
	});

	// ==========================================
	// FUNCTION: handleScanDocument
	// Triggered when user clicks "SCAN DOCUMENT" button.
	// ==========================================
	const handleScanDocument = async () => {
		// Guard: do nothing if the video isn't ready or if we are already scanning
		if (!videoRef || isProcessing()) return;

		try {
			// Set state to indicate processing has started
			setIsProcessing(true);
			setAckStatus('pending');
			setStatusMessage('Capturing photo and sending to backend...');

			// Step 1: Freeze the camera feed by pausing the video element
			videoRef.pause();

			// Step 2: Create an off-screen HTML canvas to extract the current video frame as an image
			const canvas = document.createElement('canvas');
			canvas.width = videoRef.videoWidth || 1280; // Set canvas size to match actual camera resolution
			canvas.height = videoRef.videoHeight || 720;
			const ctx = canvas.getContext('2d');
			if (!ctx) {
				throw new Error('Failed to create canvas 2D context');
			}
			// Draw the frozen video frame onto the canvas
			ctx.drawImage(videoRef, 0, 0, canvas.width, canvas.height);

			// Step 3: Convert the canvas pixel drawing into a compressed JPEG image file (Blob)
			const blob = await new Promise<Blob | null>((resolve) => {
				canvas.toBlob(resolve, 'image/jpeg', 0.92); // 92% JPEG quality
			});

			if (!blob) {
				throw new Error('Failed to generate image file blob from video stream');
			}

			// Step 4: Package the photo into FormData (standard format for uploading files via HTTP)
			const formData = new FormData();
			const timestamp = Date.now();
			formData.append('photo', blob, `document_${timestamp}.jpg`);

			// Step 5: Send the photo to the Rust backend (POST request)
			const response = await fetch(BACKEND_URL, {
				method: 'POST',
				body: formData,
			});

			// If server responds with an HTTP error code (4xx, 5xx), throw an error
			if (!response.ok) {
				throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
			}

			// Parse the JSON response sent by the backend
			const data = await response.json();

			// Step 6: Verify if the backend sent the expected "ACK" message
			if (data.status === 'ACK') {
				// Display required success message in browser developer console
				console.log('Backend ACK success', data);
				setAckStatus('success');
				setStatusMessage(`Backend ACK success — received ${Math.round(data.bytes_received / 1024)} KB`);

				// Reveal media control buttons upon successful ACK
				setHasScanned(true);
				setIsPlaying(false);
			} else {
				// If status is not "ACK", report failure
				console.error('No ACK: failed', data);
				setAckStatus('failed');
				setStatusMessage('No ACK: failed');
			}
		} catch (err) {
			// Catch network failures (e.g. backend offline) or script errors
			console.error('No ACK: failed', err);
			setAckStatus('failed');
			setStatusMessage('No ACK: failed — Backend unreachable or rejected payload');
		} finally {
			// Always turn off processing flag when finished
			setIsProcessing(false);
		}
	};

	// ==========================================
	// FUNCTION: handleRetake
	// Unfreezes the video feed and returns to initial scan screen.
	// ==========================================
	const handleRetake = async () => {
		if (videoRef) {
			try {
				await videoRef.play(); // Resume live camera feed
			} catch (err) {
				console.error('Error resuming video:', err);
			}
		}
		// Reset states back to initial values
		setHasScanned(false);
		setAckStatus('idle');
		setStatusMessage('');
	};

	// ==========================================
	// FUNCTION: togglePlayPause
	// Toggles play/pause state for the media playback controls.
	// ==========================================
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

	// ==========================================
	// USER INTERFACE (JSX / HTML TEMPLATE)
	// This is the HTML structure returned and displayed on screen.
	// Notice: In JSX, comments must be wrapped in curly braces: {/* comment here */}
	// ==========================================
	return (
		<div class="app-container">
			{/* 1. The full-screen HTML5 video element bound to our videoRef variable */}
			<video class="camera-feed" ref={videoRef} autoplay playsinline muted />

			{/* 2. Floating status banner (only shown when ackStatus is not 'idle') */}
			<Show when={ackStatus() !== 'idle'}>
				<div class={`status-banner status-${ackStatus()}`}>
					<div class="status-indicator" />
					<span class="status-text">{statusMessage()}</span>
					{/* Show a Retry button only if backend ACK failed */}
					<Show when={ackStatus() === 'failed'}>
						<button class="status-retry-btn" onClick={handleScanDocument}>
							Retry
						</button>
					</Show>
				</div>
			</Show>

			{/* 3. Viewfinder guide (corners and alignment text) - only visible BEFORE scanning */}
			<Show when={!hasScanned()}>
				<div class="viewfinder-guide">
					<div class="corner top-left" />
					<div class="corner top-right" />
					<div class="corner bottom-left" />
					<div class="corner bottom-right" />
					<div class="guide-text">Align document within frame</div>
				</div>
			</Show>

			{/* 4. Small indicator badge in top right confirming photo is captured */}
			<Show when={hasScanned()}>
				<div class="feed-badge">
					<span class="badge-dot" />
					<span>Feed Frozen (Photo Captured)</span>
				</div>
			</Show>

			{/* 5. Settings button (gear icon) in the top-left corner */}
			<button
				class="settings-btn"
				title="Settings"
				onClick={() => console.log('settings-btn pressed')}
			>
				⚙️
			</button>

			{/* 6. INITIAL STATE: Big prominent "SCAN DOCUMENT" button */}
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

			{/* 7. AFTER SCAN: Media Playback Controls & Retake button */}
			<Show when={hasScanned()}>
				<div class="playback-panel">
					{/* Button to unfreeze and scan another document */}
					<button class="retake-btn" onClick={handleRetake} title="Retake or scan another document">
						↺ Scan Another Document
					</button>
					<div class="playback-controls">
						{/* Rewind button */}
						<button
							class="control-btn"
							title="Rewind"
							onClick={() => console.log('Rewind clicked')}
						>
							⏪
						</button>
						{/* Play / Pause toggle button */}
						<button
							class="control-btn playpause"
							title={isPlaying() ? 'Pause' : 'Play'}
							onClick={togglePlayPause}
						>
							{isPlaying() ? '⏸️' : '▶️'}
						</button>
						{/* Fast Forward button */}
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

// Export App as the default export so index.tsx can load it
export default App;
