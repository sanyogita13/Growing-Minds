export interface VideoSignalFrame {
  facePresent: boolean;
  facesDetected: number;
  gazeAwayScore: number;
  headPoseScore: number;
  phoneDetected: boolean;
}

export class VideoDetectorPipeline {
  analyze(frame: ImageData | null): VideoSignalFrame {
    if (!frame) {
      return {
        facePresent: false,
        facesDetected: 0,
        gazeAwayScore: 1,
        headPoseScore: 1,
        phoneDetected: false,
      };
    }

    return {
      facePresent: true,
      facesDetected: 1,
      gazeAwayScore: 0.12,
      headPoseScore: 0.1,
      phoneDetected: false,
    };
  }
}
