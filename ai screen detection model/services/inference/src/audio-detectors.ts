export interface AudioSignalFrame {
  multipleVoices: boolean;
  backgroundPromptScore: number;
}

export class AudioDetectorPipeline {
  analyze(floatPcmWindow: Float32Array): AudioSignalFrame {
    const averageEnergy =
      floatPcmWindow.length === 0
        ? 0
        : floatPcmWindow.reduce((sum, value) => sum + Math.abs(value), 0) / floatPcmWindow.length;

    return {
      multipleVoices: averageEnergy > 0.4,
      backgroundPromptScore: Math.min(1, averageEnergy),
    };
  }
}
