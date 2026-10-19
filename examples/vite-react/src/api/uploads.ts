import axios, { type AxiosProgressEvent } from 'axios';

export async function uploadReceipt(file: File, onProgress: (percent: number) => void): Promise<string> {
  const body = new FormData();
  body.append('receipt', file);
  const response = await axios.post<{ url: string }>('/api/receipts', body, {
    onUploadProgress: (event: AxiosProgressEvent) => {
      if (event.total) onProgress(Math.round((event.loaded / event.total) * 100));
    },
  });
  return response.data.url;
}
