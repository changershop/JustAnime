import { useState, useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBars,
  faRandom,
  faMagnifyingGlass,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { useLanguage } from "@/src/context/LanguageContext";
import { Link, useLocation } from "react-router-dom";
import Sidebar from "../sidebar/Sidebar";
import { SearchProvider } from "@/src/context/SearchContext";
import WebSearch from "../searchbar/WebSearch";
import MobileSearch from "../searchbar/MobileSearch";

function Navbar() {
  const location = useLocation();
  const { language, toggleLanguage } = useLanguage();
  const [isNotHomePage, setIsNotHomePage] = useState(
    location.pathname !== "/" && location.pathname !== "/home"
  );
  const [isScrolled, setIsScrolled] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 0);
    };
    window.addEventListener("scroll", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const handleHamburgerClick = () => {
    setIsSidebarOpen(true);
  };

  const handleCloseSidebar = () => {
    setIsSidebarOpen(false);
  };

  const handleRandomClick = () => {
    if (location.pathname === "/random") {
      window.location.reload();
    }
  };

  useEffect(() => {
    setIsNotHomePage(
      location.pathname !== "/" && location.pathname !== "/home"
    );
  }, [location.pathname]);

  return (
    <SearchProvider>
      <nav
        className={`fixed top-0 left-0 w-full z-[1000000] transition-all duration-300 ease-in-out border-b border-white/[0.06]
          ${isScrolled ? "bg-[#0a0a0a]/85 backdrop-blur-xl shadow-2xl shadow-black/50" : "bg-[#0a0a0a]/95 backdrop-blur-md"}`}
      >
        <div className="max-w-[1920px] mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          {/* Left Section */}
          <div className="flex items-center gap-7">
            <div className="flex items-center gap-3.5">
              <button
                type="button"
                onClick={handleHamburgerClick}
                className="w-9 h-9 rounded-lg bg-white/[0.04] hover:bg-white/[0.1] border border-white/[0.06] flex items-center justify-center text-gray-200 hover:text-white transition-all"
                title="Open Menu"
              >
                <FontAwesomeIcon icon={faBars} className="text-base" />
              </button>
              <Link to="/home" className="flex items-center group">
                <img
                  src="/logo.png"
                  alt="JustAnime Logo"
                  className="h-9 w-auto transition-transform duration-200 group-hover:scale-[1.02]"
                />
              </Link>
            </div>

            <div className="hidden xl:flex items-center gap-5 text-sm font-medium text-white/65">
              <Link to="/home" className="hover:text-white transition-colors">
                Home
              </Link>
              <Link to="/most-popular" className="hover:text-white transition-colors">
                Most Popular
              </Link>
              <Link to="/tv" className="hover:text-white transition-colors">
                TV Series
              </Link>
              <Link to="/movie" className="hover:text-white transition-colors">
                Movies
              </Link>
              <Link to="/top-airing" className="hover:text-white transition-colors">
                Top Airing
              </Link>
            </div>
          </div>

          {/* Center Section - Search */}
          <div className="flex-1 flex justify-center items-center max-w-none mx-4 hidden md:flex">
            <div className="flex items-center gap-2 w-full max-w-[560px]">
              <WebSearch />
              <Link
                to={location.pathname === "/random" ? "#" : "/random"}
                onClick={handleRandomClick}
                className="p-[10px] aspect-square bg-white/[0.05] hover:bg-white/[0.12] border border-white/[0.07] text-white/70 hover:text-white rounded-lg transition-all flex items-center justify-center"
                title="Random Anime"
              >
                <FontAwesomeIcon icon={faRandom} className="text-base" />
              </Link>
            </div>
          </div>

          {/* Language Toggle - Desktop */}
          <div className="hidden md:flex items-center gap-1 bg-white/[0.05] border border-white/[0.07] rounded-lg p-1">
            {["EN", "JP"].map((lang) => (
              <button
                key={lang}
                onClick={() => toggleLanguage(lang)}
                className={`px-3 py-1 text-xs font-semibold tracking-wider rounded-md transition-all ${
                  language === lang
                    ? "bg-white text-black shadow-sm"
                    : "text-white/50 hover:text-white"
                }`}
              >
                {lang}
              </button>
            ))}
          </div>

          {/* Mobile Search Icon */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
              className="p-[10px] aspect-square bg-[#2a2a2a]/75 text-white/50 hover:text-white rounded-lg transition-colors flex items-center justify-center w-[38px] h-[38px]"
              title={isMobileSearchOpen ? "Close Search" : "Search Anime"}
            >
              <FontAwesomeIcon 
                icon={isMobileSearchOpen ? faXmark : faMagnifyingGlass} 
                className="w-[18px] h-[18px] transition-transform duration-200"
                style={{ transform: isMobileSearchOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
              />
            </button>
          </div>
        </div>

        {/* Mobile Search Dropdown */}
        {isMobileSearchOpen && (
          <div className="md:hidden bg-[#18181B] shadow-lg">
            <MobileSearch onClose={() => setIsMobileSearchOpen(false)} />
        </div>
        )}

        {/* Sidebar */}
        <Sidebar isOpen={isSidebarOpen} onClose={handleCloseSidebar} />
      </nav>
    </SearchProvider>
  );
}

export default Navbar;
