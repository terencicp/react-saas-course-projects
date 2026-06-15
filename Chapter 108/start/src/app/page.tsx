import { redirect } from 'next/navigation';

const Home = () => {
  redirect('/invoices');
};

export default Home;
