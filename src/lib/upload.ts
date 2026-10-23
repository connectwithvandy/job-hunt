/** Send a file straight to Convex storage and return its id. */
export async function uploadFile(uploadUrl: string, file: File) {
  const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
  if (!res.ok) throw new Error("Upload failed. Try again.");
  const { storageId } = (await res.json()) as { storageId: string };
  return storageId;
}
