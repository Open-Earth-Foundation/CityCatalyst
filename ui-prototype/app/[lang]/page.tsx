import LocaleSwitcher from "@/components/LocaleSwitcher"
import Container from "@/components/container/Container"
import { getDictionary } from "@/get-dictionary"
import { Locale } from "@/i18n-config"

type Params = {
  params: {lang:Locale}
}

export default async function Home({params: {lang}}: Params) {
  const dictionary = await getDictionary(lang)
  return (
    <div>
      <Container>
          <div className="h-[100vh] flex flex-col items-center justify-center w-[100vw]">
            <p className="text-8xl">
              {dictionary['server-component'].welcome}
            </p>
          <LocaleSwitcher />
          </div>
          
      </Container>
    </div>
  )
}
