import { onMount } from 'solid-js';
import './App.css'

function App() {
	let videoRef: HTMLVideoElement | undefined;

	onMount(async() => {
		try {
			const stream: MediaStream = await navigator.mediaDevices.getUserMedia({
				video: true,
				audio: false,
			});
		
			if (videoRef) {
				videoRef.srcObject = stream;
				await videoRef.play();
			}
		} catch (err) {
			console.error("Cannot access camera stream:", err);
		}
	});

	return (
		<div class="app-container">
			<video class="camera-feed" ref={videoRef} autoplay playsinline muted />
			<button class="settings-btn" onClick={() => console.log("settings-btn pressed")}>
				⚙️
			</button>
			<div class="playback-controls">
				<button class="control-btn">
					⏪
				</button>
				<button class="control-btn playpause">
					⏯️
				</button>
				<button class="control-btn">
					⏩
				</button>
			</div>
		</div>
  );
}

export default App
