import { extendTheme } from "@chakra-ui/react";
import { Inter } from 'next/font/google';
import { IBM_Plex_Sans } from 'next/font/google';

const inter = Inter({
  subsets: ["latin"],
  fallback: ["system-ui", "arial"],
});

const ibmPlexSans = IBM_Plex_Sans({
  weight: "700",
  subsets: ["latin"],
  display: "block",
});

export default extendTheme({
  fonts: {
    body: `${inter.style.fontFamily}, sans-serif`,
    heading: `${ibmPlexSans.style.fontFamily}, sans-serif`,
  },
  components: {
    Heading: {
      baseStyle: {
        fontWeight: "700",
        color: "#003057", // GT Navy Blue
        letterSpacing: "-0.05em",
      },
    },
  },
});
