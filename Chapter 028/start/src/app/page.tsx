import { FeatureGrid } from '@/components/feature-grid';
import { Hero } from '@/components/hero';
import { PricingTable } from '@/components/pricing-table';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

const Home = () => (
  <div className="flex min-h-dvh flex-col">
    <SiteHeader />
    <main>
      <Hero />
      <FeatureGrid />
      <PricingTable />
    </main>
    <SiteFooter />
  </div>
);

export default Home;
