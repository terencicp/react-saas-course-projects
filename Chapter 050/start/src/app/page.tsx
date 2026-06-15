import { redirect } from 'next/navigation';

const Home = () => {
  redirect('/inspector/send-welcome');
};

export default Home;
