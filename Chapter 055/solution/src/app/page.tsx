import { redirect } from 'next/navigation';

const Home = () => {
  redirect('/sign-in');
};

export default Home;
