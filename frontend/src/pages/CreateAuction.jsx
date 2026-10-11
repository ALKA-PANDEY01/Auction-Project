import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createAuction } from "../api/auction";
import { auctionCategories } from "../constants/auctionCategories";
import { useAuth } from "../context/AuthContext";
import "./CreateAuction.css";
import "./MarketDesign.css";

const initialForm = {
  title: "",
  category: "",
  description: "",
  starting_price: "",
  minimum_increment: "",
  start_time: "",
  end_time: "",
};

function CreateAuction() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [image, setImage] = useState(null);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");

    const startsAt = new Date(form.start_time);
    const endsAt = new Date(form.end_time);
    if (endsAt <= startsAt) {
      setError("The auction end time must be after its start time.");
      return;
    }

    setIsSubmitting(true);
    try {
      const auction = await createAuction({
        ...form,
        start_time: startsAt.toISOString(),
        end_time: endsAt.toISOString(),
        image,
      });
      navigate(`/auctions/${auction.id}`);
    } catch (requestError) {
      const detail = requestError.response?.data?.detail;
      setError(Array.isArray(detail) ? detail.map((item) => item.msg).join(" ") : detail || "We couldn't create this auction. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="create-auction-page">
      <header className="create-header">
        <Link className="create-brand" to="/auctions"><span>B</span> bidhouse</Link>
        <Link className="create-back" to="/auctions">← All lots</Link>
        <div className="create-account"><span>Hi, {user?.name?.split(" ")[0]}</span><button type="button" onClick={() => signOut().catch(() => {})}>Sign out</button></div>
      </header>

      <section className="create-content">
        <div className="create-intro">
          <span className="create-eyebrow">YOUR NEXT CHAPTER</span>
          <h1>Bring a good find<br />to the <em>market.</em></h1>
          <p>Share the details, set the bidding window, and let your piece find its next home.</p>
        </div>

        <form className="create-form" onSubmit={handleSubmit}>
          {error && <div className="create-error" role="alert">{error}</div>}

          <label>Lot title<input name="title" value={form.title} onChange={updateField} maxLength={200} required placeholder="e.g. Mid-century walnut lounge chair" /></label>
          <label>Category<select name="category" value={form.category} onChange={updateField} required>
            <option value="" disabled>Select a category</option>
            {auctionCategories.map((category) => <option value={category.value} key={category.value}>{category.label}</option>)}
          </select></label>
          <label>Description<textarea name="description" value={form.description} onChange={updateField} rows={4} placeholder="What makes this piece special?" /></label>

          <div className="create-fields-row">
            <label>Starting bid (INR)<input name="starting_price" type="number" min="0.01" step="0.01" value={form.starting_price} onChange={updateField} required /></label>
            <label>Minimum increment (INR)<input name="minimum_increment" type="number" min="0.01" step="0.01" value={form.minimum_increment} onChange={updateField} required /></label>
          </div>

          <div className="create-fields-row">
            <label>Bidding opens<input name="start_time" type="datetime-local" value={form.start_time} onChange={updateField} required /></label>
            <label>Auction ends<input name="end_time" type="datetime-local" value={form.end_time} onChange={updateField} required /></label>
          </div>

          <label>Item photo<input type="file" accept="image/*" onChange={(event) => setImage(event.target.files?.[0] || null)} /></label>
          <p className="create-time-hint">Auction times use your local time zone.</p>

          <button className="create-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating auction…" : "Create auction"}<span aria-hidden="true">→</span>
          </button>
        </form>
      </section>

      <footer className="create-footer"><span>Good things deserve a second story.</span><span>© 2026 BIDHOUSE</span></footer>
    </main>
  );
}

export default CreateAuction;
