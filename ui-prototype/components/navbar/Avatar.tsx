import Image from "next/image"
import myImage from '../images/placeholder.jpg';

const Avatar = () => {
    return(
        <Image 
            src={myImage}
            alt="User Avatar"
            width={30}
            height={30}
            className='rounded-full'
        />
    )
}


export default Avatar;