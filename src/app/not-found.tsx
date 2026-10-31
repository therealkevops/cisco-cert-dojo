import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page">
      <section className="hero">
        <div>
          <span className="silk">% Invalid input detected at &apos;^&apos; marker.</span>
          <h1 className="display">
            No route to <em>host.</em>
          </h1>
          <p className="lede">That page is not in the routing table.</p>
          <Link className="sw primary" href="/" style={{ marginTop: 18 }}>
            Back to the rack
          </Link>
        </div>
      </section>
    </main>
  );
}
