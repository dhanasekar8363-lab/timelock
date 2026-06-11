import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";
import "./EditProfile.css";

export default function EditProfile() {
  const [user, setUser] = useState(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [currentAvatar, setCurrentAvatar] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      const { data } = await supabase.auth.getUser();

      if (data.user) {
        setUser(data.user);
        setName(data.user.user_metadata?.full_name || "");

        const { data: profile } = await supabase
          .from("profiles")
          .select("bio, avatar_url")
          .eq("id", data.user.id)
          .single();

        if (profile) {
          setBio(profile.bio || "");
          setCurrentAvatar(profile.avatar_url || "");
        }
      }
    };

    loadUser();
  }, []);

  const uploadAvatar = async (file) => {
    const ext = file.name.split(".").pop();
    const fileName = `${user.id}.${ext}`;

    const { error } = await supabase.storage
      .from("avatars")
      .upload(fileName, file, { upsert: true });

    if (error) throw error;

    const { data } = supabase.storage
      .from("avatars")
      .getPublicUrl(fileName);

    return data.publicUrl;
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const saveProfile = async () => {
    let avatarUrl = currentAvatar;

    if (selectedFile) {
      avatarUrl = await uploadAvatar(selectedFile);
    }

    await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        full_name: name,
        avatar_url: avatarUrl,
        bio: bio,
      });

    alert("Profile Updated");
  };

  if (!user) return null;

  return (
    <div className="edit-profile-page">
      <div className="edit-profile-card">

        <h2>Edit Profile</h2>

        <div className="avatar-preview">
          {avatarPreview || currentAvatar ? (
            <img src={avatarPreview || currentAvatar} alt="avatar" />
          ) : (
            name.charAt(0).toUpperCase()
          )}
        </div>

        <label className="avatar-upload-label">
          Change Photo
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
        </label>

        <label>Name</label>

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
        />

        <label>Email</label>

        <input
          type="text"
          value={user.email}
          disabled
        />

        <label>Bio</label>

        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Write something..."
        />

        <button
          className="save-btn"
          onClick={saveProfile}
        >
          Save Changes
        </button>

      </div>
    </div>
  );
}
