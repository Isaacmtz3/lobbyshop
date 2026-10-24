import { Link } from 'react-router-dom'

export function TermsOfService() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <h1 className="mb-1 font-display text-3xl font-bold text-bone">Terms of Service</h1>
      <p className="mb-8 text-sm text-mute">Last updated October 5, 2026</p>

      <div className="space-y-8 text-sm leading-relaxed text-mute">
        <Section title="1. Agreement to these terms">
          <p>
            These Terms of Service ("Terms") govern your access to and use of Lobby (the "Service"), a platform
            that connects barbershops with clients looking for a haircut and lets shops manage a live queue. By
            creating an account or otherwise using the Service, you agree to these Terms. If you don't agree,
            don't use the Service.
          </p>
        </Section>

        <Section title="2. Who can use Lobby">
          <p>
            You must be at least 13 years old to create a client account, and at least 18 years old to create a
            shop owner account. By creating an account, you confirm you meet this requirement and that the
            information you provide is accurate.
          </p>
        </Section>

        <Section title="3. Accounts and roles">
          <p>Lobby has a few account types, each with different responsibilities:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong className="text-bone">Clients</strong> browse shops, check in to a queue, and track their
              position in real time.
            </li>
            <li>
              <strong className="text-bone">Shop owners</strong> list and run a shop's queue, including adding
              staff and barbers, and managing clients checked in at their shop.
            </li>
            <li>
              <strong className="text-bone">Agents</strong> may check clients into a shop's queue on their behalf
              (for example, at the shop's front desk).
            </li>
          </ul>
          <p className="mt-2">
            You're responsible for keeping your login credentials secure and for all activity under your account.
          </p>
        </Section>

        <Section title="4. Queue conduct">
          <p>
            To keep the queue fair for everyone, you may only have one active check-in across the entire platform
            at a time — you can't hold a spot in multiple shops' queues simultaneously. When you check in, you'll
            be asked for an estimated arrival time; shops rely on that estimate to manage their queue. Shops may
            mark a check-in as a no-show and remove it from the queue if you don't show up within a reasonable
            window after being called.
          </p>
        </Section>

        <Section title="5. Shop owner responsibilities">
          <p>
            If you list a shop on Lobby, you're responsible for the accuracy of your shop's information (name,
            address, services, hours) and for complying with any licensing, health, or business regulations that
            apply to operating a barbershop in your area. Lobby doesn't verify that shops are licensed or
            otherwise compliant with local law.
          </p>
        </Section>

        <Section title="6. Prohibited conduct">
          <p>You agree not to:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Check into a queue with no intention of showing up, or repeatedly abandon check-ins.</li>
            <li>Impersonate another person or shop, or submit false shop information.</li>
            <li>Scrape, reverse-engineer, or interfere with the Service or its underlying systems.</li>
            <li>Use the Service for anything unlawful or to harass another user.</li>
          </ul>
        </Section>

        <Section title="7. Fees">
          <p>
            Lobby is currently free to use for both clients and shops. We may introduce paid features or
            subscriptions in the future, and if we do, we'll give notice before any charge applies to your
            account.
          </p>
        </Section>

        <Section title="8. Third-party services">
          <p>
            Lobby relies on third-party providers to operate — including a database and authentication provider,
            an address lookup/mapping provider, and a hosting provider. Your use of features built on these
            providers (like address autocomplete or "shops near me") is also subject to their own terms.
          </p>
        </Section>

        <Section title="9. Disclaimers">
          <p>
            The Service is provided "as is," without warranties of any kind. We don't guarantee that wait time
            estimates, queue positions, or shop information will always be accurate or available without
            interruption. Lobby is a platform connecting clients and shops — we aren't a party to, and aren't
            responsible for, the actual haircut or service a shop provides.
          </p>
        </Section>

        <Section title="10. Limitation of liability">
          <p>
            To the fullest extent permitted by law, Lobby and its operator won't be liable for any indirect,
            incidental, or consequential damages arising from your use of the Service, including missed
            appointments, lost time, or disputes between clients and shops.
          </p>
        </Section>

        <Section title="11. Termination">
          <p>
            We may suspend or terminate your account if you violate these Terms or misuse the Service, including
            repeated no-shows or abuse of the queue system. You may stop using the Service and request account
            deletion at any time.
          </p>
        </Section>

        <Section title="12. Governing law">
          <p>
            These Terms are governed by the laws of the State of Texas, without regard to its conflict-of-laws
            rules.
          </p>
        </Section>

        <Section title="13. Changes to these terms">
          <p>
            We may update these Terms from time to time. If we make material changes, we'll update the "Last
            updated" date above. Continuing to use the Service after changes take effect means you accept the
            updated Terms.
          </p>
        </Section>

        <Section title="14. Contact">
          <p>
            Questions about these Terms? Reach out to the email associated with the Lobby account that manages
            this platform.
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
