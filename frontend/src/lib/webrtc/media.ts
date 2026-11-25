export async function getLocalMedia(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('MEDIA_UNAVAILABLE');
  }

  return navigator.mediaDevices.getUserMedia({ audio: true, video: true });
}
