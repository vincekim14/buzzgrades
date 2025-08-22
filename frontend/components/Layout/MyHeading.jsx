import Head from "next/head";

const DEFAULT_TITLE =
  "Buzz Grades - Georgia Tech Grade Data";
const DEFAULT_DESC = "View grades for past classes, professors, and more at Georgia Tech.";

const publicURL = process.env.NEXT_PUBLIC_VERCEL_URL
  ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
  : "";
const MyHeading = ({
  title,
  // Default social sharing image for Open Graph (og:image) and Twitter cards
  // Used when pages don't specify a custom imageURL 
  // Should be 1200x630px PNG with Buzz Grades branding for social media previews
  imageURL = `${publicURL}/images/advert-small.png`,
}) => (
  <Head>
    <title>{title || DEFAULT_TITLE}</title>
    <meta name={"description"} content={DEFAULT_DESC} />
    <link rel={"icon"} href={"/favicon.ico"} />
    <meta name={"theme-color"} content={"#5B0013"} />
    <meta property={"og:type"} content={"website"} />
    <meta property={"og:url"} content={"https://buzzgrades.org/"} />
    <meta property={"og:title"} content={title || DEFAULT_TITLE} />
    <meta property={"og:description"} content={DEFAULT_DESC} />
    {imageURL && (
      <>
        <meta property={"og:image"} content={imageURL} />
        <meta property={"twitter:image"} content={imageURL} />
      </>
    )}
    <meta property={"twitter:card"} content={"summary_large_image"} />
    <meta
      property={"twitter:url"}
      content={
        process.env.NEXT_PUBLIC_VERCEL_URL
          ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
          : ""
      }
    />
    <meta property={"twitter:title"} content={title || DEFAULT_TITLE} />
    <meta property={"twitter:description"} content={DEFAULT_DESC} />
    {/* eslint-disable-next-line @next/next/no-sync-scripts */}
  </Head>
);
export default MyHeading;
