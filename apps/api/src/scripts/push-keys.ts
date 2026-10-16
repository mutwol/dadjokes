import webpush from "web-push";

/** Prints a new VAPID key pair for Web Push. Put both in the API's environment. */
const keys = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}\nVAPID_PRIVATE_KEY=${keys.privateKey}`);
