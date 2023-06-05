import React from 'react';
import Container from '../container/Container';
import Logo from './Logo';
import NavbarMenu from './NavbarMenu';
import UserControl from './UserControl';

const Navbar = (props) => {
    return(
        <div className='
            w-full
            h-16
            border-b-2
        '>
            <Container>
                {/* Logo */}
                <Logo />
                {/* Menu Items */}
                <NavbarMenu lang={props.lang}/>
                {/* User controls */}
                <UserControl />
            </Container>
        </div>
    )
}

export default Navbar;