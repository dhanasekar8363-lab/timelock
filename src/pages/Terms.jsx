import { Link } from 'react-router-dom';
import './Legal.css';

const LAST_UPDATED = 'June 20, 2026';

export default function Terms() {
  return (
    <div className="legal-page">
      <div className="legal-card">
        <Link to="/login" className="legal-back-link">← Back</Link>

        <h1>Terms of Service</h1>
        <p className="legal-updated">Last updated: {LAST_UPDATED}</p>

        <p>
          Welcome to TimeLock. These Terms of Service ("Terms") govern your
          access to and use of the TimeLock mobile application and website
          (the "Service"), provided by Dhanasekar Y. By creating an account or
          using the Service, you agree to be bound by these Terms.
        </p>

        <h2>1. Eligibility</h2>
        <p>
          You must be at least 13 years old to use TimeLock. By using the
          Service, you represent that you meet this requirement and that you
          have the legal capacity to agree to these Terms.
        </p>

        <h2>2. Your Account</h2>
        <p>
          You sign in to TimeLock using Google Sign-In. You are responsible for
          maintaining the security of your Google account and for all activity
          that occurs under your TimeLock account. Notify us immediately if you
          suspect unauthorized access to your account.
        </p>

        <h2>3. User Content</h2>
        <p>
          TimeLock lets you create "capsules" containing text, photos, and
          other content, and to send messages to other users. You retain
          ownership of the content you submit. By submitting content, you grant
          us a limited license to store, process, and display that content
          solely for the purpose of operating the Service, including sharing
          capsules with recipients you designate.
        </p>
        <p>You agree not to use the Service to create or share content that:</p>
        <ul>
          <li>Is illegal, defamatory, harassing, or abusive</li>
          <li>Infringes on the intellectual property or privacy rights of others</li>
          <li>Contains malware or any code intended to disrupt the Service</li>
          <li>Impersonates another person or entity</li>
          <li>Is intended to exploit, harm, or sexualize minors in any way</li>
        </ul>
        <p>
          We reserve the right to remove content and suspend or terminate
          accounts that violate these Terms.
        </p>

        <h2>4. Capsules and Scheduled Unlocking</h2>
        <p>
          TimeLock allows you to "lock" content so that it becomes available
          ("unlocks") at a future date and time that you select. You are
          responsible for setting accurate unlock dates and for the content of
          any capsule you create. We make reasonable efforts to ensure capsules
          unlock as scheduled, but we do not guarantee uninterrupted
          availability of the Service.
        </p>

        <h2>5. Acceptable Use</h2>
        <p>
          You agree not to misuse the Service, including by attempting to gain
          unauthorized access to other users' accounts or data, interfering
          with the normal operation of the Service, or using the Service for
          any unlawful purpose.
        </p>

        <h2>6. Third-Party Services</h2>
        <p>
          TimeLock uses Google Sign-In for authentication and Supabase for
          backend infrastructure. Your use of these third-party services may
          also be subject to their own terms and privacy policies.
        </p>

        <h2>7. Termination</h2>
        <p>
          You may stop using the Service and request deletion of your account
          at any time by contacting us. We may suspend or terminate your access
          to the Service if you violate these Terms or if we discontinue the
          Service.
        </p>

        <h2>8. Disclaimer of Warranties</h2>
        <p>
          The Service is provided "as is" and "as available" without
          warranties of any kind, whether express or implied. We do not
          guarantee that the Service will be uninterrupted, secure, or
          error-free, or that any capsule will unlock at precisely the
          scheduled time.
        </p>

        <h2>9. Limitation of Liability</h2>
        <p>
          To the fullest extent permitted by law, Dhanasekar Y shall not be
          liable for any indirect, incidental, special, or consequential
          damages arising out of or related to your use of the Service,
          including loss of data or content.
        </p>

        <h2>10. Changes to the Service or Terms</h2>
        <p>
          We may modify or discontinue the Service, in whole or in part, at any
          time. We may also update these Terms from time to time; continued use
          of the Service after changes take effect constitutes acceptance of
          the revised Terms.
        </p>

        <h2>11. Contact Us</h2>
        <p>
          If you have any questions about these Terms, please contact us at{' '}
          <a href="mailto:dhanasekar8363@gmail.com">dhanasekar8363@gmail.com</a>.
        </p>
      </div>
    </div>
  );
}
