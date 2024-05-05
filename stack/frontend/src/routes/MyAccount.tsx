// MyAccount Route component

import { MyAccount } from "@components/MyAccount";
import { Footer } from '@components/Home/Footer';
import { Navbar } from '@components/Home/Navbar';

export function MyAccountRoute() {
    return (
        <main className="text-sm text-white">
            <Navbar/>
            <MyAccount />
            <Footer />
        </main>
    );
}