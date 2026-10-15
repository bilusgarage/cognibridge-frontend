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
		<div>
			<video class="camera-feed" ref={videoRef} autoplay playsinline muted />
		</div>
  );
}

export default App
