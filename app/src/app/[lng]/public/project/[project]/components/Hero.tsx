/**
 * Hero section with title, description and call-to-action
 * @param overviewLabel - Small label above the main heading
 * @param heading - The main headline for the hero section
 * @param mainParagraph - First paragraph of descriptive text
 * @param secondaryParagraph - Second paragraph of descriptive text
 * @param ctaText - Text for the call-to-action button
 * @param ctaLink - Link for the call-to-action button
 */

interface HeroProps {
  overviewLabel: string;
  heading: string;
  mainParagraph: string;
  secondaryParagraph: string;
  ctaText: string;
  ctaLink: string;
}

const Hero = () => {
  const heroText = {
    overviewLabel: "PROJECT OVERVIEW",
    heading: "Brazilian cities are stepping up for climate action.",
    mainParagraph:
      "As part of the CHAMP commitment—a global initiative to align local and national climate efforts—50 cities are advancing mitigation and adaptation strategies ahead of COP30.",
    secondaryParagraph:
      "This platform presents data-driven profiles built from public datasets to inform and scale climate action across municipalities. Explore city-level emissions, climate risks, and prioritized actions from across Brazil.",
    ctaText: "MORE ABOUT CHAMP BRAZIL",
    ctaLink: "/about",
  };

  return (
    <section
      className="relative py-32 px-6 bg-cover bg-center"
      style={{
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.4), rgba(0, 0, 0, 0.5)), url(/assets/projects_dashboard/rio_background.png)`,
        minHeight: "100vh",
      }}
    >
      <div className="max-w-4xl mx-auto relative z-10 pt-20">
        {/* Overview label */}
        <div className="text-gray-100 uppercase text-sm tracking-wider font-medium mb-4">
          {heroText.overviewLabel}
        </div>

        {/* Main heading */}
        <h1 className="text-4xl md:text-6xl font-bold mb-8 text-white leading-tight">
          {heroText.heading}
        </h1>

        {/* First descriptive paragraph */}
        <p className="text-white text-base max-w-2xl mb-6">
          {heroText.mainParagraph}
        </p>

        {/* Second descriptive paragraph */}
        <p className="text-white text-base max-w-2xl mb-10">
          {heroText.secondaryParagraph}
        </p>

        {/* Call-to-action button */}
        <div>
          <a
            href={heroText.ctaLink}
            className="inline-block px-8 py-3 rounded-full border-2 border-white text-white uppercase text-sm tracking-wider font-medium hover:bg-white/10 transition-colors"
          >
            {heroText.ctaText}
          </a>
        </div>
      </div>
    </section>
  );
};

export default Hero;
