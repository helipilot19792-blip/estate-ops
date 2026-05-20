self.addEventListener("push", (event) => {
  let data = {};

  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = {
        title: "Estate of Mind Portal",
        body: event.data.text(),
      };
    }
  }

  const title = data.title || "Estate of Mind Portal";
  const options = {
    body: data.body || "You have a new portal update.",
    icon: data.icon || "/estateoslogo.png",
    badge: data.badge || "/estateoslogo.png",
    tag: data.tag || "estate-ops-update",
    data: {
      url: data.url || "/cleaner",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = new URL(event.notification.data?.url || "/cleaner", self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client && client.url === targetUrl) {
          return client.focus();
        }
      }

      return clients.openWindow(targetUrl);
    })
  );
});
