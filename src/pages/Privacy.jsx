import { Link } from 'react-router-dom';
import './Legal.css';

const LAST_UPDATED = 'June 20, 2026';

export default function Privacy() {
  return (
    <div className="legal-page">
      <div className="legal-card">
        <Link to="/login" className="legal-back-link">← Back</Link>

        <h1>Privacy Policy</h1>
        <p className="legal-updated">Last updated: {LAST_UPDATED}</p>

        <p>
          TimeLock ("we", "our", or "us") is developed and operated by Dhanasekar Y.
          This Privacy Policy explains how we collect, use, and protect your
          information when you use the TimeLock mobile application and website
          (the "Service"). By using TimeLock, you agree to the collection and use
          of information described in this policy.
        </p>

        <h2>1. Information We Collect</h2>
        <h3>1.1 Account Information</h3>
        <p>
          When you sign in with Google, we receive and store your name, email
          address, and profile photo as provided by Google. This is used solely
          to create and manage your TimeLock account.
        </p>

        <h3>1.2 User-Generated Content</h3>
        <p>
          We store the content you create within the app, including but not
          limited to time capsules, messages you send to other users, capsule
          media (photos, text, and other attachments), and your interactions with
          in-app features such as your pet companion. This content is stored so
          we can provide the core functionality of the Service, such as locking
          and unlocking capsules at the times you specify.
        </p>

        <h3>1.3 Information We Do Not Collect</h3>
        <p>
          We do not collect analytics data, crash reports, advertising
          identifiers, or device push tokens. We do not use third-party
          advertising or tracking SDKs.
        </p>

        <h2>2. How We Use Your Information</h2>
        <ul>
          <li>To create and authenticate your account</li>
          <li>To let you create, store, share, and unlock time capsules</li>
          <li>To enable messaging between users you choose to interact with</li>
          <li>To display your profile information to other users as intended by app features (e.g. shared capsules)</li>
          <li>To operate, maintain, and improve the Service</li>
        </ul>
        <p>
          We do not sell your personal information to third parties, and we do
          not use your data for advertising purposes.
        </p>

        <h2>3. How We Share Your Information</h2>
        <p>
          We do not share your personal information with third parties except:
        </p>
        <ul>
          <li>
            <strong>Service providers:</strong> We use Supabase to authenticate
            users and store account and app data securely. We use Google
            Sign-In solely for authentication purposes.
          </li>
          <li>
            <strong>Other users:</strong> Content you choose to share (such as a
            capsule link, profile information, or messages) is visible to the
            users you share it with, consistent with the app's intended
            functionality.
          </li>
          <li>
            <strong>Legal requirements:</strong> If required to do so by law, or
            in response to valid legal requests.
          </li>
        </ul>

        <h2>4. Data Storage and Security</h2>
        <p>
          Your data is stored using Supabase's hosted infrastructure, which
          employs industry-standard security measures, including encryption in
          transit. While we take reasonable steps to protect your information,
          no method of electronic storage or transmission is 100% secure, and we
          cannot guarantee absolute security.
        </p>

        <h2>5. Data Retention</h2>
        <p>
          We retain your account and content data for as long as your account
          remains active. If you delete your account, your personal information
          and content will be deleted from our active systems, except where we
          are required to retain certain data for legal or security purposes.
        </p>

        <h2>6. Your Rights and Choices</h2>
        <ul>
          <li>You can review and edit your profile information within the app at any time.</li>
          <li>You can request deletion of your account and associated data by contacting us at the email below.</li>
          <li>You can revoke TimeLock's access to your Google account at any time via your Google Account settings.</li>
        </ul>

        <h2>7. Children's Privacy</h2>
        <p>
          TimeLock is not directed at children under the age of 13, and we do
          not knowingly collect personal information from children under 13. If
          you believe a child has provided us with personal information, please
          contact us so we can remove it.
        </p>

        <h2>8. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy from time to time. Any changes will
          be posted on this page with an updated "Last updated" date. Continued
          use of the Service after changes take effect constitutes acceptance of
          the revised policy.
        </p>

        <h2>9. Contact Us</h2>
        <p>
          If you have any questions about this Privacy Policy or how your data
          is handled, please contact us at{' '}
          <a href="mailto:dhanasekar8363@gmail.com">dhanasekar8363@gmail.com</a>.
        </p>
      </div>
    </div>
  );
}
