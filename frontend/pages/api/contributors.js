export default async function handler(req, res) {
  if (!process.env.GITHUB_TOKEN) {
    res.status(401).json({
      success: false,
      data: [],
      error: 'GitHub token not configured'
    });
    return;
  }

  try {
    const contribsResponse = await fetch(
      "https://api.github.com/repos/vincekim14/buzzgrades/collaborators",
      {
        headers: {
          Authorization: `token ${process.env.GITHUB_TOKEN}`,
        },
      }
    );

    if (!contribsResponse.ok) {
      throw new Error(`GitHub API error: ${contribsResponse.status}`);
    }

    const contribs = await contribsResponse.json();

    const contribsWithNames = await Promise.all(
      contribs.map(async (contrib) => {
        try {
          const userResponse = await fetch(contrib.url, {
            headers: {
              Authorization: `token ${process.env.GITHUB_TOKEN}`,
            },
          });

          if (!userResponse.ok) {
            console.warn(`Failed to fetch user data for ${contrib.login}`);
            return { login: contrib.login, name: contrib.login };
          }

          const user = await userResponse.json();
          return {
            ...user,
          };
        } catch (error) {
          console.warn(`Error fetching user ${contrib.login}:`, error);
          return { login: contrib.login, name: contrib.login };
        }
      })
    );

    // cache this request for a month
    res.setHeader(
      "Cache-Control",
      `public, s-maxage=${60 * 60 * 24 * 30}, stale-while-revalidate=${
        60 * 60 * 24 * 30
      }`
    );

    res.status(200).json({
      success: true,
      data: contribsWithNames,
    });
  } catch (error) {
    console.error('GitHub API error:', error);
    res.status(500).json({
      success: false,
      data: [],
      error: 'Failed to fetch contributors'
    });
  }
}
