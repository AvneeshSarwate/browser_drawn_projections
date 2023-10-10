class VideoAudioAnalyzer {
  private videoElement: HTMLVideoElement;
  private context: AudioContext;
  private gainNode: GainNode;
  private analyzerNodes: AnalyserNode[];
  public drawCallback?: (low: number, mid: number, high: number) => void;
  public drawing: boolean = false;
  private filters: BiquadFilterNode[];

  constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;
    this.context = new AudioContext();
    this.gainNode = this.context.createGain();
    this.filters = ["lowpass", "bandpass", "highpass"].map((type) => {
      const filter = this.context.createBiquadFilter();
      filter.type = type as BiquadFilterType;
      return filter;
    });
    this.analyzerNodes = this.filters.map(() => this.context.createAnalyser());
    this.connectVideoToAudioApi();
  }

  private connectVideoToAudioApi() {
    const sourceNode = this.context.createMediaElementSource(this.videoElement);
    sourceNode.connect(this.gainNode).connect(this.context.destination);
    this.filters.forEach((filter, index) => {
      sourceNode.connect(filter).connect(this.analyzerNodes[index]);
    });
  }

  private getAverageAmplitude(analyzerNode: AnalyserNode): number {
    const dataArr = new Float32Array(analyzerNode.fftSize);
    analyzerNode.getFloatTimeDomainData(dataArr);
    let sumOfSquares = 0;
    for (let i = 0; i < dataArr.length; i++) {
      sumOfSquares += dataArr[i] * dataArr[i];
    }
    return Math.sqrt(sumOfSquares / dataArr.length);
  }

  set volume(value: number) {
    this.gainNode.gain.setValueAtTime(value, this.context.currentTime);
  }

  get volume(): number {
    return this.gainNode.gain.value;
  }

  private animate() {
    if (!this.drawCallback || !this.drawing) {
      return;
    }
    const amplitudes = this.analyzerNodes.map((analyzer) =>
      this.getAverageAmplitude(analyzer)
    );
    this.drawCallback(amplitudes[0], amplitudes[1], amplitudes[2]);
    requestAnimationFrame(() => this.animate());
  }

  public startAnimating() {
    this.drawing = true;
    this.animate();
  }
}

// Example usage:
const videoElement = document.querySelector('video')!;
const analyzer = new VideoAudioAnalyzer(videoElement);
analyzer.volume = 0.5;
analyzer.drawCallback = (low, mid, high) => {
  console.log(`Low: ${low}, Mid: ${mid}, High: ${high}`);
};
analyzer.startAnimating();
