self.addEventListener('push', function(event) {
  if (!event.data) return
  const data = event.data.json()
  event.waitUntil(
    self.registration.showNotification(data.title || 'מעקב כשרות', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      dir: 'rtl',
      lang: 'he',
      data: { url: data.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', function(event) {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Reuse an open app window: exact page first, then any page of the app.
      const exact = windowClients.find(c => c.url === url)
      if (exact && 'focus' in exact) return exact.focus()
      const any = windowClients.find(c => new URL(c.url).origin === self.location.origin)
      if (any && 'navigate' in any) return any.navigate(url).then(c => (c || any).focus())
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})
