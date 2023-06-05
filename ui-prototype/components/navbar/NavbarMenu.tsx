import Link from "next/link";
import { getDictionary } from "@/get-dictionary"
import { Locale } from "@/i18n-config";

type Params = {
    params: {lang:Locale}
}
  
const NavbarMenu = async ({lang}) => {
    const dictionary = await getDictionary(lang);
    const MenuItems = [
        {
            title: dictionary['server-component'].home,
            url: '#',
        },
        {
            title: dictionary['server-component'].about,
            url: '#',
        }
    ]

    return (
        <div
            className='
                flex
                items-center
                justify-center
                flex-grow
                gap-8
                            '
        >
            {
                MenuItems.map((item, index) => (
                    <Link
                        key={index}
                        href={item.url}
                        className="text-lg hover:underline font-bold"
                    >
                        {item.title}
                    </Link>
                ))
            }   
        </div>
    )
}

export default NavbarMenu;