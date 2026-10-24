import { Link } from 'react-router-dom'

export function PrivacyPolicy() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="mb-1 font-display text-3xl font-bold text-bone">Privacy Policy</h1>
      <p className="mb-8 text-sm text-mute">Last updated October 5, 2026</p>

      <div className="space-y-8 text-sm leading-relaxed text-mute">
        <Section title="1. Introduction">
          <p>
            This Privacy Policy explains what information Lobby collects, how we use it, and the choices you
            have. It applies to everyone who uses Lobby — clients, shop owners, and agents.
          </p>
        </Section>

        <Section title="2. Information we collect">
          <p>
            <strong className="text-bone">Account information:</strong> name, email address, phone number, and
            password when you sign up.
          </p>
          <p className="mt-2">
            <strong className="text-bone">Queue and check-in information:</strong> the service you request, your
            estimated arrival time, and your position/status in a shop's queue.
          </p>
          <p className="mt-2">
            <strong className="text-bone">Shop information:</strong> if you list a shop, its name, address,
            phone number, and other details you provide.
          </p>
          <p className="mt-2">
            <strong className="text-bone">Location information:</strong> if you use "shops near me," we request
            your device's location to sort shops by distance — this is only used in your browser session and
            isn't stored on our servers. If you use address autocomplete when listing a shop, what you type is
            sent to our mapping provider to look up matching addresses.
          </p>
          <p className="mt-2">
            <strong className="text-bone">Usage information:</strong> standard technical data collected by our
            hosting provider (like IP address and browser type) for security and reliability purposes.
          </p>
        </Section>

        <Section title="3. How we use your information">
          <p>We use your information to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Operate the queue system — connecting clients with shops and tracking check-ins in real time.</li>
            <li>Let shops see who's checked in and their estimated arrival, so they can manage their queue.</li>
            <li>Show you nearby shops and provide address lookup when listing a shop.</li>
            <li>Maintain the security and reliability of the Service.</li>
            <li>Communicate with you about your account or the Service.</li>
          </ul>
        </Section>

        <Section title="4. How we share information">
          <p>We share information only as needed to run the Service:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong className="text-bone">With shops you check into</strong> — a shop you check in with can see
              the check-in details you submit (name, phone, service, ETA).
            </li>
            <li>
              <strong className="text-bone">With service providers</strong> who help us operate Lobby — our
              database/authentication provider, our mapping/address-lookup provider, and our hosting provider.
              These providers only receive what they need to perform their function and aren't permitted to use
              your data for their own purposes.
            </li>
            <li>
              <strong className="text-bone">If required by law</strong>, or to protect the rights, safety, and
              property of Lobby, our users, or the public.
            </li>
          </ul>
          <p className="mt-2">We don't sell your personal information.</p>
        </Section>

        <Section title="5. Data retention">
          <p>
            We keep your account and queue history for as long as your account is active, or as needed to operate
            the Service. You can request deletion of your account and associated data at any time (see Section
            7).
          </p>
        </Section>

        <Section title="6. Security">
          <p>
            We use industry-standard practices — including encrypted connections and access controls that
            restrict shop data to that shop's own staff — to protect your information. No system is perfectly
            secure, so we can't guarantee absolute security.
          </p>
        </Section>

        <Section title="7. Your choices">
          <p>You can:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Update your account information at any time.</li>
            <li>Decline to share your device location — "shops near me" will simply show all shops unsorted.</li>
            <li>Request that we delete your account and associated data.</li>
          </ul>
        </Section>

        <Section title="8. Children's privacy">
          <p>
            Lobby isn't directed at children under 13, and we don't knowingly collect information from them. If
            you believe a child has created an account, contact us and we'll remove it.
          </p>
        </Section>

        <Section title="9. Changes to this policy">
          <p>
            We may update this Privacy Policy from time to time. If we make material changes, we'll update the
            "Last updated" date above.
          </p>
        </Section>

        <Section title="10. Contact">
          <p>
            Questions about this Privacy Policy, or want to request your data be deleted? Reach out to the email
            associated with the Lobby account that manages this platform.
          </p>
        </Section>
      </div>

      <Link to="/" className="mt-10 inline-block text-sm text-brandBright hover:underline">
        ← Back to Lobby
      </Link>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 font-display text-lg font-semibold text-bone">{title}</h2>
      {children}
    </section>
  )
}
