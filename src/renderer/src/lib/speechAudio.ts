import { SPEECH_SAMPLE_RATE, downmixToMono, encodeWav } from '@shared/wav'

/**
 * Turns a MediaRecorder clip (webm/opus) into the 16 kHz mono 16-bit WAV that whisper.cpp
 * and the IPC check expect. decodeAudioData resamples to its context's rate, so decoding
 * in a 16 kHz offline context does the resampling without rendering a graph.
 */
export async function toSpeechWav(clip: Blob): Promise<Uint8Array> {
  const encoded = await clip.arrayBuffer()
  const context = new OfflineAudioContext(1, 1, SPEECH_SAMPLE_RATE)
  const audio = await context.decodeAudioData(encoded)
  const channels = Array.from({ length: audio.numberOfChannels }, (_, index) =>
    audio.getChannelData(index)
  )
  return encodeWav(downmixToMono(channels), SPEECH_SAMPLE_RATE)
}
