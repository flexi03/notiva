/**
 * Preload of the Moodle windows (sign-in, course pages). Electron can't use Touch ID / Face ID or
 * Windows Hello for websites: Microsoft's passkey prompt would hang forever. So WebAuthn is hidden
 * from the page – identity providers then offer their other ways (Authenticator app, code, password).
 * Nothing else is exposed: no bridge, no Node.
 */
import { contextBridge } from 'electron'

contextBridge.executeInMainWorld({
  func: () => {
    const w = window as unknown as Record<string, unknown>
    for (const name of [
      'PublicKeyCredential',
      'AuthenticatorAttestationResponse',
      'AuthenticatorAssertionResponse',
    ])
      delete w[name]
    const credentials = navigator.credentials as CredentialsContainer | undefined
    if (credentials) {
      const refuse = (
        original: (options?: CredentialRequestOptions & CredentialCreationOptions) => Promise<unknown>,
      ) =>
        function (
          this: CredentialsContainer,
          options?: CredentialRequestOptions & CredentialCreationOptions,
        ) {
          if (options && 'publicKey' in options)
            return Promise.reject(
              new DOMException('Passkeys werden in diesem Fenster nicht unterstützt', 'NotAllowedError'),
            )
          return original.call(this, options)
        }
      credentials.get = refuse(credentials.get.bind(credentials)) as typeof credentials.get
      credentials.create = refuse(credentials.create.bind(credentials)) as typeof credentials.create
    }
  },
})
