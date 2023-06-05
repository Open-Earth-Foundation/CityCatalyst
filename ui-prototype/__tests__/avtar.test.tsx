import Avatar from "@/components/navbar/Avatar";
import {cleanup, render, screen, act} from "@testing-library/react";

const lang = "en" 

describe('Home', () => {
    afterEach(cleanup)

    it("renders a welcome heading", async ()=>{
       let component;
       await act(async () => {
        component = render(<Avatar />)
       })
    })
})