export const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    const error = new Error(`API error: ${res.status} ${res.statusText}`);
    (error as any).status = res.status;
    throw error;
  }
  return res.json();
};
