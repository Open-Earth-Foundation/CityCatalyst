import Avatar from "./Avatar";
import {HiBars3, HiOutlineFlag} from 'react-icons/hi2'

const UserMenu = () => {
    return(
        <div className="flex items-center gap-3 cursor-pointer hover:">
            {/* User Menu */}
            <button>
                <HiBars3 size={24} className="text-neutral-700"/>
            </button>
            {/* User Avatar */}
            <Avatar />

        </div>
    )
}

export default UserMenu;