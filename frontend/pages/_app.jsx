import { ChakraProvider } from "@chakra-ui/react";
import theme from "../theme";
import { CachedNavigationProvider } from "../components/CachedNavigation";

function MyApp({ Component, pageProps }) {
  return (
    <ChakraProvider theme={theme}>
      <CachedNavigationProvider>
        <Component {...pageProps} />
      </CachedNavigationProvider>
    </ChakraProvider>
  );
}

export default MyApp;
