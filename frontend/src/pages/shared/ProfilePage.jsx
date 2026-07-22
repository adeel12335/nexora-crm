import { useState } from 'react';
import { api } from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import PasswordInput from '../../components/PasswordInput.jsx';

const MIN_PASSWORD_LENGTH = 8;

function checkPhone(raw, label) {
  if (!raw || !String(raw).trim()) return '';
  const cleaned = String(raw).replace(/[\s\-().]/g, '');
  if (!/^\+?\d+$/.test(cleaned)) return `${label}: digits, spaces and dashes only`;
  if (cleaned.startsWith('+')) {
    return /^[1-9]\d{7,14}$/.test(cleaned.slice(1))
      ? ''
      : `${label}: international numbers look like +14155552671`;
  }
  if (/^0\d{10}$/.test(cleaned) || /^3\d{9}$/.test(cleaned) || /^92\d{10}$/.test(cleaned)) return '';
  return `${label}: Pakistani mobiles are 11 digits (03001234567), or use +country code`;
}

export default function ProfilePage() {
  const { user, token, updateUser } = useAuth();
  const { showToast } = useToast();

  const [profileForm, setProfileForm] = useState({
    name: user?.name ?? '',
    phone: user?.phone ?? '',
    whatsappNumber: user?.whatsappNumber ?? '',
  });
  const [profileError, setProfileError] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordError, setPasswordError] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  async function saveProfile(e) {
    e.preventDefault();
    setProfileError('');

    const errors = [];
    if (!profileForm.name.trim()) errors.push('Name is required');
    else if (profileForm.name.trim().length < 2) errors.push('Name must be at least 2 characters');
    for (const [field, label] of [['phone', 'Phone'], ['whatsappNumber', 'WhatsApp']]) {
      const msg = checkPhone(profileForm[field], label);
      if (msg) errors.push(msg);
    }
    if (errors.length) return setProfileError(errors.join(' · '));

    setSavingProfile(true);
    try {
      const { user: updated } = await api.updateProfile(token, {
        name: profileForm.name.trim(),
        phone: profileForm.phone || null,
        whatsappNumber: profileForm.whatsappNumber || null,
      });
      updateUser(updated);
      showToast('Profile updated');
    } catch (err) {
      setProfileError(err.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePassword(e) {
    e.preventDefault();
    setPasswordError('');

    const errors = [];
    if (!passwordForm.currentPassword) errors.push('Enter your current password');
    if (!passwordForm.newPassword) errors.push('Enter a new password');
    else if (passwordForm.newPassword.length < MIN_PASSWORD_LENGTH) {
      errors.push(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    } else if (!/[A-Za-z]/.test(passwordForm.newPassword) || !/\d/.test(passwordForm.newPassword)) {
      errors.push('New password needs at least one letter and one number');
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      errors.push('New password and confirmation do not match');
    }
    if (errors.length) return setPasswordError(errors.join(' · '));

    setSavingPassword(true);
    try {
      await api.changePassword(token, {
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      showToast('Password changed');
    } catch (err) {
      setPasswordError(err.message || 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <>
      <section className="page-section">
        <div className="section-heading">
          <div>
            <h2>My profile</h2>
            <p>Update your details and change your password</p>
          </div>
        </div>

        <div className="panel">
          {profileError && <p className="form-error">{profileError}</p>}
          <form className="settings-stack" onSubmit={saveProfile}>
            <label>
              Full name
              <input
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                placeholder="Ali Raza"
              />
            </label>
            <label>
              Login email
              <input value={user?.email ?? ''} disabled />
              <span className="field-hint">Contact an admin to change your login email</span>
            </label>
            <label>
              Phone
              <input
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                placeholder="03001234567"
              />
            </label>
            <label>
              WhatsApp <span className="field-hint">(alerts go here)</span>
              <input
                value={profileForm.whatsappNumber}
                onChange={(e) => setProfileForm({ ...profileForm, whatsappNumber: e.target.value })}
                placeholder="03001234567"
              />
            </label>
            <button type="submit" className="tool-btn primary" disabled={savingProfile}>
              {savingProfile ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </div>
      </section>

      <section className="page-section">
        <div className="section-heading">
          <div>
            <h2>Change password</h2>
            <p>You will need your current password to set a new one</p>
          </div>
        </div>

        <div className="panel">
          {passwordError && <p className="form-error">{passwordError}</p>}
          <form className="settings-stack" onSubmit={savePassword}>
            <label>
              Current password
              <PasswordInput
                autoComplete="current-password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
              />
            </label>
            <label>
              New password
              <PasswordInput
                autoComplete="new-password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                placeholder="Min 8 chars, letter + number"
              />
            </label>
            <label>
              Confirm new password
              <PasswordInput
                autoComplete="new-password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              />
            </label>
            <button type="submit" className="tool-btn primary" disabled={savingPassword}>
              {savingPassword ? 'Saving…' : 'Change password'}
            </button>
          </form>
        </div>
      </section>
    </>
  );
}
