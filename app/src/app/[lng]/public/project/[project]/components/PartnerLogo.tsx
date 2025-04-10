interface PartnerLogo {
  id: string;
  name: string;
  logo?: string;
}

interface PartnerLogosProps {
  partners: PartnerLogo[];
}

const PartnerLogos = ({ partners }: PartnerLogosProps) => {
  return (
    <section className="py-12 px-6 bg-white border-t border-gray-100">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-8 items-center justify-items-center">
          {partners.map((partner) => (
            <div
              key={partner.id}
              className="h-10 flex items-center justify-center"
              aria-label={`Logo of ${partner.name}`}
            >
              {partner.logo && (
                <img
                  src={partner.logo}
                  alt={partner.name}
                  className="max-h-full max-w-full object-contain hover:opacity-100 hover:grayscale-0 transition-all duration-300"
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PartnerLogos;
