export const ANDROID_VERIFICATION_METHODS = ['m.sas.v1','m.qr_code.show.v1','m.qr_code.scan.v1','m.reciprocate.v1'];
// Matrix verification QR codes contain binary keys, not URLs or UTF-8 text.
export function matrixQrBytes(data: ArrayLike<number>): Uint8ClampedArray {
  const bytes = Uint8ClampedArray.from(data);
  if (bytes.length < 10 || bytes.length > 4096 || [77,65,84,82,73,88].some((value,index)=>bytes[index]!==value) || bytes[6]!==2) {
    throw new Error('这不是设备验证二维码。请扫描另一台设备验证页面中的二维码。');
  }
  return bytes;
}
export function verificationFailure(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') return '无法使用相机，请允许相机权限，或改用表情／数字对比。';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return '未找到相机，可出示二维码让另一台设备扫描，或使用表情／数字对比。';
  if (name === 'NotReadableError') return '相机正在被占用，请关闭其他使用相机的应用后重试。';
  return error instanceof Error ? error.message : '验证未能完成，请重试或换一种验证方式。';
}
