export enum FilterType {
  LowPass = 'lowpass',
  BandPass = 'bandpass',
  HighPass = 'highpass'
}

export class MediaAudioAnalyzer {
  private videoElement: HTMLMediaElement;
  private context: AudioContext;
  private gainNode: GainNode;
  private analyzerNodes: AnalyserNode[];
  public drawCallback?: (low: number, mid: number, high: number) => void;
  public drawing: boolean = false;
  private filters: Record<FilterType, BiquadFilterNode>;

  constructor(videoElement: HTMLMediaElement) {
    this.videoElement = videoElement;
    this.context = new AudioContext();
    this.gainNode = this.context.createGain();
    this.analyzerNodes = Array(3).fill(null).map(() => this.context.createAnalyser());
    this.filters = {
      [FilterType.LowPass]: this.createFilter(FilterType.LowPass),
      [FilterType.BandPass]: this.createFilter(FilterType.BandPass),
      [FilterType.HighPass]: this.createFilter(FilterType.HighPass),
    };
    this.connectVideoToAudioApi();
  }

  private createFilter(type: FilterType): BiquadFilterNode {
    const filter = this.context.createBiquadFilter();
    filter.type = type;
    return filter;
  }

  //todo hotreload - make connecting video element to audio api hotreload safe
  private connectVideoToAudioApi() {
    const sourceNode = this.context.createMediaElementSource(this.videoElement);
    sourceNode.connect(this.gainNode).connect(this.context.destination);
    
    Object.values(this.filters).forEach((filter, index) => {
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

  setFilterFrequency(filterType: FilterType, frequency: number) {
    const filter = this.filters[filterType];
    filter.frequency.setValueAtTime(frequency, this.context.currentTime);
  }

  getFilterFrequency(filterType: FilterType): number {
    return this.filters[filterType].frequency.value;
  }

  setFilterQ(filterType: FilterType, Q: number) {
    const filter = this.filters[filterType];
    filter.Q.setValueAtTime(Q, this.context.currentTime);
  }

  getFilterQ(filterType: FilterType): number {
    return this.filters[filterType].Q.value;
  }

  public draw(): void {
    const amplitudes = this.analyzerNodes.map((analyzer) =>
      this.getAverageAmplitude(analyzer)
    );
    this.drawCallback?.(amplitudes[0], amplitudes[1], amplitudes[2])
  }

  private animate() {
    if (!this.drawCallback || !this.drawing) {
      return;
    }
    this.draw();
    requestAnimationFrame(() => this.animate());
  }

  public startAnimating() {
    this.drawing = true;
    this.animate();
  }
}


const testCalls = () => {
  // Example usage:
  const videoElement = document.querySelector('video')!; // Assume the video element exists
  const analyzer = new MediaAudioAnalyzer(videoElement);

  analyzer.volume = 0.5;
  analyzer.drawCallback = (low, mid, high) => {
    console.log(`Low: ${low}, Mid: ${mid}, High: ${high}`);
  };

  analyzer.setFilterFrequency(FilterType.LowPass, 440);
  analyzer.setFilterQ(FilterType.LowPass, 1);
  console.log(`Lowpass filter frequency: ${analyzer.getFilterFrequency(FilterType.LowPass)}`);
  console.log(`Lowpass filter Q: ${analyzer.getFilterQ(FilterType.LowPass)}`);

  analyzer.startAnimating();
}