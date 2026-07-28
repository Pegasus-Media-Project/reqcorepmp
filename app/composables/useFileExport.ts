/**
 * Download a generated file from a POST endpoint.
 *
 * The export endpoints take a body (selected ids, filters, format) and answer
 * with the file itself, so the browser can't just follow a link — this fetches
 * the blob and hands it to a temporary anchor.
 */
export function useFileExport() {
  const busy = ref(false)
  const toast = useToast()

  async function download(url: string, body: Record<string, unknown>, filename: string) {
    if (busy.value) return
    busy.value = true
    try {
      const blob = await $fetch<Blob>(url, { method: 'POST', body, responseType: 'blob' })
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(objectUrl)
    }
    catch (err: any) {
      toast.error('Export failed', {
        message: err?.data?.statusMessage,
        statusCode: err?.data?.statusCode ?? err?.statusCode,
      })
    }
    finally {
      busy.value = false
    }
  }

  return { busy, download }
}
