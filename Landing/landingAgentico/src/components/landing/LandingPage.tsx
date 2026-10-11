import { Navbar } from './Navbar';
import { Hero } from './Hero';
import { SocialProof } from './SocialProof';
import { Features } from './Features';
import { HowItWorks } from './HowItWorks';
import { Showcase } from './Showcase';
import { Pricing } from './Pricing';
import { Faq } from './Faq';
import { CtaFinal } from './CtaFinal';
import { Footer } from './Footer';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#121212] text-zinc-100 antialiased">
      <Navbar />
      <main>
        <Hero />
        <SocialProof />
        <Features />
        <HowItWorks />
        <Showcase />
        <Pricing />
        <Faq />
        <CtaFinal />
      </main>
      <Footer />
    </div>
  );
}
