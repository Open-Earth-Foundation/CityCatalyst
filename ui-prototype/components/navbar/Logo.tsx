import Image from "next/image";
import OCALogo from '../images/logo.png'

const Logo = () => {
    return(
        <div className=''>
            <Image 
                src={OCALogo}
                alt="OpenClimate Cities  Logo"
                width={200}
                height={200}
            />
        </div>
    )
}

export default Logo;