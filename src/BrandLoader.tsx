import BrandLogo from "./BrandLogo";

export default function BrandLoader(){
  return (
    <main className="brand-loader-screen" role="status" aria-label="Loading De VERVE" aria-busy="true">
      <span className="brand-loader-orbit" aria-hidden="true" />
      <BrandLogo className="brand-loader-logo" />
    </main>
  );
}
