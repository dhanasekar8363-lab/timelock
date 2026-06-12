import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../services/supabase";
import "./EditProfile.css";

export default function EditProfile() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState(null);

  useEffect(() => {
    const loadUser = async () => {
      const { data: authData } = await supabase.auth.getUser();

      if (authData.user) {
        setUser(authData.user);

        const { data } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", authData.user.id)
          .single();

        if (data) {
          setName(data.display_name || authData.user.user_metadata?.full_name || "");
          setBio(data.bio || "");
          setAvatarUrl(data.avatar_url || "");
        } else {
          setName(authData.user.user_metadata?.full_name || "");
        }
      }
    };

    loadUser();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const uploadAvatar = async (file) => {
    const fileName = `${user.id}-${Date.now()}`;

    const { error } = await supabase.storage
      .from("avatars")
      .upload(fileName, file);

    if (error) {
      console.log(error);
      return null;
    }

    const {
      data: { publicUrl },
    } = supabase.storage
      .from("avatars")
      .getPublicUrl(fileName);

    return publicUrl;
  };

  const saveProfile = async () => {
    let updates = {
      display_name: name,
      bio: bio,
    };

    if (selectedFile) {
      const avatarUrl = await uploadAvatar(selectedFile);

      if (avatarUrl) {
        updates.avatar_url = avatarUrl;
      }
    }

    const { data, error } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", user.id);

    console.log("DATA:", data);
    console.log("ERROR:", error);

    if (error) {
      alert(error.message);
      return;
    }

    if (updates.avatar_url) {
      setAvatarUrl(updates.avatar_url);
      setPreviewUrl(null);
    }

    alert("Profile Updated");
    navigate("/profile");
  };

  if (!user) return null;

  return (
    <div className="edit-profile-page">
      <div className="edit-profile-card">

        <h2>Edit Profile</h2>

        <div className="avatar-preview">
          {previewUrl || avatarUrl ? (
            <img src={previewUrl || avatarUrl} alt="avatar" />
          ) : (
            name.charAt(0).toUpperCase()
          )}
        </div>

        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
        />

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
          onChange={(e) =>
            setBio(e.target.value)
          }
          placeholder="Tell people about yourself..."
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
